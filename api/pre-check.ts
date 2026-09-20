import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac } from 'crypto';
import { initFirebase, getUid, currentMonthKey, currentWeekKey, resolvePaidStatus } from './_lib/shared.js';

// Learning-center students get the premium allowance for free.
const CENTER_MONTHLY_LIMIT = 25;

// Free-plan users (no subscription) get 1 AI feedback report per calendar
// week instead of a single lifetime bonus report.
const FREE_WEEKLY_LIMIT = 1;

type CreditErrorCode = 'USER_NOT_FOUND' | 'NOT_PRO' | 'LIMIT_REACHED' | 'FREE_LIMIT_REACHED';
class CreditError extends Error {
  constructor(public code: CreditErrorCode) { super(code); }
}

function signToken(uid: string, isBonus: boolean): string {
  const secret = process.env.NONCE_SECRET ?? 'fallback-secret-change-in-prod';
  const b64uid = Buffer.from(uid).toString('base64url');
  const ts = Date.now().toString();
  const bonus = isBonus ? '1' : '0';
  const payload = `${b64uid}.${bonus}.${ts}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

async function consumeCredit(uid: string, monthKey: string): Promise<boolean> {
  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  let isBonus = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new CreditError('USER_NOT_FOUND');

    const data = snap.data()!;
    // One shared definition of "has paid" across every route — see
    // resolvePaidStatus in ./_lib/shared.ts. It applies the expiresAt rule (a
    // lapsed paid plan reverts to free, because nothing else ever downgrades
    // the stored `plan` field; lifetime plans and centre students never
    // expire), matching what src/hooks/useUsage.ts shows the user.
    const { plan, isCenterStudent, isPaidPlan } = resolvePaidStatus(data);

    if (!isPaidPlan && !isCenterStudent) {
      // Admin-granted bonus reports are consumed first (separate from the
      // automatic weekly free allowance).
      const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
      if (bonus > 0) {
        tx.set(userRef, { bonusAnalyses: bonus - 1 }, { merge: true });
        isBonus = true;
        return;
      }

      // Free plan: 1 AI feedback report per calendar week.
      const weekKey = currentWeekKey();
      const freeUsage = data.freeUsage ?? {};
      const freeUsed = freeUsage.weekKey === weekKey ? (freeUsage.count ?? 0) : 0;
      if (freeUsed >= FREE_WEEKLY_LIMIT) throw new CreditError('FREE_LIMIT_REACHED');
      tx.set(userRef, { freeUsage: { weekKey, count: freeUsed + 1 } }, { merge: true });
      isBonus = true;
      return;
    }

    // Learning-center students always get the premium allowance (25/month),
    // regardless of whether the center's own subscription is still active.
    const planLimits: Record<string, number> = { forever: 9999, premium: 25, standard: 12, basic: 5 };
    const monthlyLimit = isCenterStudent
      ? Math.max(CENTER_MONTHLY_LIMIT, planLimits[plan] ?? 0)
      : planLimits[plan as string];
    if (!monthlyLimit) throw new CreditError('NOT_PRO');

    const usage = data.usage ?? {};
    const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
    if (used >= monthlyLimit) throw new CreditError('LIMIT_REACHED');

    tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
  });

  return isBonus;
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
  let isBonus = false;

  try {
    isBonus = await consumeCredit(uid, monthKey);
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      if (e.code === 'NOT_PRO') return res.status(403).json({ error: 'AI feedback requires a paid plan (Basic, Standard, Premium, or Lifetime).' });
      if (e.code === 'LIMIT_REACHED') return res.status(429).json({ error: 'Monthly analysis limit reached. Quota resets next month.' });
      if (e.code === 'FREE_LIMIT_REACHED') return res.status(429).json({ error: "You've used your free essay check for this week. Upgrade to Basic, Standard, or Premium for more reports, or come back next week." });
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
    }
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  const token = signToken(uid, isBonus);
  return res.status(200).json({ token, isBonus, uid, monthKey });
}

export { signToken, currentMonthKey };
export type { CreditErrorCode };
