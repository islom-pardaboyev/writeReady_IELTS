import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac } from 'crypto';
import { initFirebase, getUid, currentDayKey, currentWeekKey, resolvePaidStatus } from './_lib/shared.js';
import { nextRenewal, planCycle, usedThisCycle } from './_lib/planCycle.js';
import { LIMITS, essayKeys, loadSavedReport, type SavedReport } from './_lib/savedReports.js';
import { MAX_SENTENCES, countSentences, reportsPaused } from './_lib/essayGuard.js';
import { chargeIdOf, newCharge, sweepStaleCharges, type CreditSource } from './_lib/charges.js';

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
export type { CreditSource };

type CreditErrorCode = 'USER_NOT_FOUND' | 'LIMIT_REACHED' | 'FREE_LIMIT_REACHED' | 'FULL_ONLY' | 'PAUSED';
class CreditError extends Error {
  /** For LIMIT_REACHED: when the plan's allowance refills, or null when the plan ends first. */
  renewsAt: Date | null = null;
  constructor(public code: CreditErrorCode) { super(code); }
}

const dayMonth = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

// FeedbackPage.tsx spots this error by its "analysis limit reached" wording.
function limitReachedMessage(renewsAt: Date | null): string {
  return renewsAt
    ? `Monthly analysis limit reached. Your reports renew on ${dayMonth(renewsAt)}.`
    : 'Monthly analysis limit reached. Your plan ends before it renews: renew the plan to get more reports.';
}

function signToken(uid: string, source: CreditSource, ts: number): string {
  // No default: a secret written in the source code would let anyone sign
  // their own tokens. api/feedback.ts refuses to run without it too.
  const secret = process.env.NONCE_SECRET;
  if (!secret) throw new Error('NONCE_SECRET is not set');
  const b64uid = Buffer.from(uid).toString('base64url');
  const payload = `${b64uid}.${source}.${ts}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * `fullOnly` is for a student who already holds the score-only report on
 * this essay: another score-only one would change nothing, so it may only
 * spend an allowance that buys the full report, and never the weekly free one.
 */
async function consumeCredit(uid: string, { fullOnly = false } = {}): Promise<{ source: CreditSource; token: string }> {
  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  // Asking for a report is the clearest sign a student is here, and this
  // write happens anyway, so "last active" comes along for free.
  const seen = { lastActiveAt: FieldValue.serverTimestamp() };
  // The token's timestamp and the pending charge's, so they name one moment.
  const at = Date.now();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return new CreditError('USER_NOT_FOUND');

    // Charges for reports that could never finish come back first, so the
    // numbers below are the ones the student really has (./_lib/charges.ts).
    const sweep = sweepStaleCharges(snap.data()!, at);
    const data = sweep.data;

    // Takes the credit and writes down the pending charge api/feedback.ts
    // settles. Everything goes in one write, refunds from the sweep included.
    const take = (src: CreditSource, fields: Record<string, unknown>) => {
      const token = signToken(uid, src, at);
      const sig = token.slice(token.lastIndexOf('.') + 1);
      const swept = (sweep.fields.pendingCharges ?? {}) as Record<string, unknown>;
      tx.set(userRef, {
        ...sweep.fields,
        ...fields,
        ...seen,
        pendingCharges: { ...swept, [chargeIdOf(sig)]: newCharge(src, data, at) },
      }, { merge: true });
      return { source: src, token };
    };
    // A refusal still saves what the sweep gave back.
    const refuse = (error: CreditError) => {
      if (Object.keys(sweep.fields).length) tx.set(userRef, sweep.fields, { merge: true });
      return error;
    };

    // Too many reports the AI started and could not finish today. They were
    // all refunded; new ones wait for tomorrow (./_lib/essayGuard.ts).
    if (reportsPaused(data.aiRefunds, currentDayKey())) return refuse(new CreditError('PAUSED'));

    // One shared definition of "has paid" across every route — see
    // resolvePaidStatus in ./_lib/shared.ts. It applies the expiresAt rule (a
    // lapsed paid plan reverts to free, because nothing else ever downgrades
    // the stored `plan` field; lifetime plans never expire), matching what
    // src/hooks/useUsage.ts shows the user. A centre student holds the plan
    // their centre bought and the centre's contract end date.
    const { isPaidPlan, monthlyLimit } = resolvePaidStatus(data);

    if (!isPaidPlan) {
      // Admin-granted bonus reports are consumed first (separate from the
      // automatic weekly free allowance).
      const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
      if (bonus > 0) return take('bonus', { bonusAnalyses: bonus - 1 });

      if (fullOnly) return refuse(new CreditError('FULL_ONLY'));

      // Free plan: 1 AI feedback report per calendar week.
      const weekKey = currentWeekKey();
      const freeUsage = (data.freeUsage ?? {}) as { weekKey?: string; count?: number };
      const freeUsed = freeUsage.weekKey === weekKey ? (freeUsage.count ?? 0) : 0;
      if (freeUsed >= FREE_WEEKLY_LIMIT) return refuse(new CreditError('FREE_LIMIT_REACHED'));
      return take('free', { freeUsage: { weekKey, count: freeUsed + 1 } });
    }

    // monthlyLimit covers every paid plan: a learning-center student's profile
    // carries the plan their center bought, and a Customizable plan carries its
    // own number, so one value serves students and individual customers alike.
    // The month is the plan's own, counted from its end date, so a plan given
    // on the 20th refills on the 20th, not on the 1st (./_lib/planCycle.ts).
    const used = usedThisCycle(data.usage, data.expiresAt);
    if (used < monthlyLimit) {
      return take('paid', { usage: { monthKey: planCycle(data.expiresAt).key, count: used + 1 } });
    }

    // The month's allowance is spent. Fall back to admin-granted bonus reports
    // before refusing: the monthly allowance resets and is lost if unused, a
    // bonus never expires, so spending the plan first is what the student
    // wants. Without this a paid student could never spend a bonus at all --
    // the reward for topping the leaderboard sat on their account unusable,
    // and they were told their limit was reached while holding one.
    const paidBonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
    if (paidBonus > 0) return take('bonus', { bonusAnalyses: paidBonus - 1 });

    const limitReached = new CreditError('LIMIT_REACHED');
    limitReached.renewsAt = nextRenewal(data.expiresAt);
    return refuse(limitReached);
  });

  if (result instanceof CreditError) throw result;
  return result;
}

function savedResponse(saved: SavedReport) {
  return { saved: { raw: saved.raw, tier: saved.tier, reportId: saved.reportId } };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Checked before any credit is taken, so a missing secret can never charge
  // a student for a report that cannot be signed.
  if (!process.env.NONCE_SECRET) {
    console.error('pre-check: NONCE_SECRET is not set');
    return res.status(500).json({ error: 'AI feedback is not set up correctly. Please contact @writeready_admin on Telegram.' });
  }

  try { initFirebase(); } catch (e: unknown) {
    console.error('pre-check: Firebase init failed:', e);
    return res.status(500).json({ error: 'The server could not start. Please try again shortly.' });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Invalid or missing auth token. Please sign in again.' });
  }

  // A report is saved once it is marked. When the browser says which essay
  // it wants, look for this student's saved report on it first: opening it
  // again never costs a credit, on any device. `lookupOnly` asks without
  // ever charging, for a page that only wants to know. Older browsers send
  // no essay and go straight to charging, as before.
  const { essayText, questionText, taskType, lookupOnly } = req.body ?? {};
  const hasEssay =
    typeof essayText === 'string' && essayText.trim() !== '' && essayText.length <= LIMITS.essayChars &&
    typeof questionText === 'string' && questionText.trim() !== '' && questionText.length <= LIMITS.questionChars &&
    (taskType === 'Task 1' || taskType === 'Task 2');
  if (lookupOnly === true && !hasEssay) return res.status(400).json({ error: 'The essay to look up is missing.' });
  // Refused before anything is charged: a report goes through every sentence,
  // so an essay of hundreds of tiny ones can only be cut off (api/_lib/essayGuard.ts).
  if (hasEssay) {
    const sentences = countSentences(essayText);
    if (sentences > MAX_SENTENCES) {
      return res.status(413).json({ error: `Your essay has ${sentences} sentences. The checker accepts up to ${MAX_SENTENCES}. You were not charged.` });
    }
  }

  let saved: SavedReport | null = null;
  if (hasEssay) {
    try {
      saved = await loadSavedReport(uid, essayKeys(taskType, questionText, essayText).contentKey);
    } catch (e) {
      // Not finding a saved report costs the student at most a fresh marking.
      console.error('pre-check: could not read saved reports:', e);
    }
    if (saved && (saved.tier === 'full' || lookupOnly === true)) return res.status(200).json(savedResponse(saved));
    if (!saved && lookupOnly === true) return res.status(200).json({ saved: null });
  }

  let source: CreditSource;
  let token: string;
  try {
    ({ source, token } = await consumeCredit(uid, { fullOnly: saved !== null }));
  } catch (e: unknown) {
    // The student holds the score-only report and cannot buy the full one
    // right now: give them what they have rather than an error.
    if (saved) return res.status(200).json(savedResponse(saved));
    if (e instanceof CreditError) {
      if (e.code === 'LIMIT_REACHED') return res.status(429).json({ error: limitReachedMessage(e.renewsAt) });
      if (e.code === 'FREE_LIMIT_REACHED') return res.status(429).json({ error: "You've used your free essay check for this week. Upgrade to Basic, Standard, or Premium for more reports, or come back next week." });
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
      if (e.code === 'PAUSED') return res.status(429).json({ error: "Several of your reports didn't finish today. You weren't charged for any of them, but new reports are paused until tomorrow. If this keeps happening, message @writeready_admin on Telegram." });
    }
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  // `limited` is what the client needs: only the weekly free report is the
  // score-only one. `isBonus` is kept for older clients still in a browser tab.
  return res.status(200).json({
    token, source, limited: source === 'free', isBonus: source !== 'paid', uid,
  });
}
