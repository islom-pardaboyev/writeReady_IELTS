import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac } from 'crypto';
import { initFirebase, getUid, currentMonthKey, currentWeekKey, resolvePaidStatus, PLAN_LIMITS } from './_lib/shared.js';

// Free-plan users (no subscription) get 1 AI feedback report per calendar
// week instead of a single lifetime bonus report.
const FREE_WEEKLY_LIMIT = 1;

/**
 * Which allowance paid for this report. It decides two separate things, which
 * is why one boolean was not enough:
 *
 *   'paid'  monthly plan quota     full report, refunds to usage
 *   'bonus' admin-granted reward   full report, refunds to bonusAnalyses
 *   'free'  weekly free allowance  score only,  refunds to freeUsage
 *
 * A bonus is a gift an admin hands to a student who did well, so it has to be
 * worth having: it buys the same full report a paying student gets. Only the
 * automatic weekly free report is the score-only one.
 */
export type CreditSource = 'paid' | 'bonus' | 'free';

type CreditErrorCode = 'USER_NOT_FOUND' | 'NOT_PRO' | 'LIMIT_REACHED' | 'FREE_LIMIT_REACHED';
class CreditError extends Error {
  constructor(public code: CreditErrorCode) { super(code); }
}

function signToken(uid: string, source: CreditSource): string {
  const secret = process.env.NONCE_SECRET ?? 'fallback-secret-change-in-prod';
  const b64uid = Buffer.from(uid).toString('base64url');
  const ts = Date.now().toString();
  const payload = `${b64uid}.${source}.${ts}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

async function consumeCredit(uid: string, monthKey: string): Promise<CreditSource> {
  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  let source: CreditSource = 'paid';

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new CreditError('USER_NOT_FOUND');

    const data = snap.data()!;
    // One shared definition of "has paid" across every route — see
    // resolvePaidStatus in ./_lib/shared.ts. It applies the expiresAt rule (a
    // lapsed paid plan reverts to free, because nothing else ever downgrades
    // the stored `plan` field; lifetime plans never expire), matching what
    // src/hooks/useUsage.ts shows the user. A centre student holds the plan
    // their centre bought and the centre's contract end date.
    const { plan, isPaidPlan } = resolvePaidStatus(data);

    if (!isPaidPlan) {
      // Admin-granted bonus reports are consumed first (separate from the
      // automatic weekly free allowance).
      const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
      if (bonus > 0) {
        tx.set(userRef, { bonusAnalyses: bonus - 1 }, { merge: true });
        source = 'bonus';
        return;
      }

      // Free plan: 1 AI feedback report per calendar week.
      const weekKey = currentWeekKey();
      const freeUsage = data.freeUsage ?? {};
      const freeUsed = freeUsage.weekKey === weekKey ? (freeUsage.count ?? 0) : 0;
      if (freeUsed >= FREE_WEEKLY_LIMIT) throw new CreditError('FREE_LIMIT_REACHED');
      tx.set(userRef, { freeUsage: { weekKey, count: freeUsed + 1 } }, { merge: true });
      source = 'free';
      return;
    }

    // A learning-center student's profile carries the plan their center
    // bought, so one lookup covers students and individual customers alike.
    const monthlyLimit = PLAN_LIMITS[plan];
    if (!monthlyLimit) throw new CreditError('NOT_PRO');

    const usage = data.usage ?? {};
    const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
    if (used < monthlyLimit) {
      tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
      return;
    }

    // The month's allowance is spent. Fall back to admin-granted bonus reports
    // before refusing: the monthly allowance resets and is lost if unused, a
    // bonus never expires, so spending the plan first is what the student
    // wants. Without this a paid student could never spend a bonus at all --
    // the reward for topping the leaderboard sat on their account unusable,
    // and they were told their limit was reached while holding one.
    const paidBonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
    if (paidBonus > 0) {
      tx.set(userRef, { bonusAnalyses: paidBonus - 1 }, { merge: true });
      source = 'bonus';
      return;
    }

    throw new CreditError('LIMIT_REACHED');
  });

  return source;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Invalid or missing auth token. Please sign in again.' });
  }

  const monthKey = currentMonthKey();
  let source: CreditSource = 'paid';

  try {
    source = await consumeCredit(uid, monthKey);
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      if (e.code === 'NOT_PRO') return res.status(403).json({ error: 'AI feedback requires a paid plan (Basic, Standard, Premium, or Lifetime).' });
      if (e.code === 'LIMIT_REACHED') return res.status(429).json({ error: 'Monthly analysis limit reached. Quota resets next month.' });
      if (e.code === 'FREE_LIMIT_REACHED') return res.status(429).json({ error: "You've used your free essay check for this week. Upgrade to Basic, Standard, or Premium for more reports, or come back next week." });
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
    }
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  const token = signToken(uid, source);
  // `limited` is what the client needs: only the weekly free report is the
  // score-only one. `isBonus` is kept for older clients still in a browser tab.
  return res.status(200).json({
    token, source, limited: source === 'free', isBonus: source !== 'paid', uid, monthKey,
  });
}

export { signToken, currentMonthKey };
export type { CreditErrorCode };
