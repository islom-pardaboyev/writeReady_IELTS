import type { VercelRequest } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Shared by api/check-practice.ts, api/feedback.ts, and api/pre-check.ts.
// Cannot be shared with src/ (separate builds — see src/lib/weeklyFree.ts).

export function initFirebase(): void {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase env vars.');
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export async function getUid(req: VercelRequest): Promise<string> {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('MISSING_TOKEN');
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Monday-start ISO week key, e.g. "2026-W28".
export function currentWeekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Local-date day key, e.g. "2026-09-20". Matches how currentMonthKey reads the
// clock, so a daily quota rolls over at the same local midnight the month does.
export function currentDayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const PAID_PLANS = ['basic', 'standard', 'premium', 'forever'];

export interface PaidStatus {
  /** The plan after expiry is applied — 'free' once a paid plan has lapsed. */
  plan: string;
  isCenterStudent: boolean;
  /**
   * `plan` is one of the metered tiers. This is the one that drives the monthly
   * report quota, because only these have a number in planLimits.
   */
  isPaidPlan: boolean;
  /**
   * Any paid signal at all, including a legacy `subscription` date. Use this to
   * gate a FEATURE on/off — never to pick a quota, since a legacy account can
   * be `isPaid` with `plan: 'free'` and so has no monthly limit to look up.
   */
  isPaid: boolean;
}

/**
 * The single definition of "this user has paid", shared by every API route.
 *
 * It exists because there used to be two: pre-check.ts read `plan`, while
 * check-practice.ts read `subscription` — a field the admin panel writes as ""
 * for Basic/Standard/Premium. That mismatch locked every paying customer out
 * of the vocabulary checker. Add new gated routes here, not beside it.
 *
 * `subscription` is still honoured (as 'forever' or as a future date) so that
 * older accounts written before `plan` existed keep working.
 */
export function resolvePaidStatus(data: Record<string, unknown>): PaidStatus {
  let plan = typeof data.plan === 'string' ? data.plan : 'free';
  const isCenterStudent = typeof data.centerId === 'string' && data.centerId.length > 0;

  // A paid plan past its expiry reverts to free; nothing else downgrades the
  // stored `plan` field. Lifetime plans and centre students never expire here.
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : '';
  if (plan !== 'forever' && expiresAt && new Date(expiresAt) < new Date()) {
    plan = 'free';
  }

  const subscription = typeof data.subscription === 'string' ? data.subscription : '';
  const subscriptionActive =
    subscription === 'forever' ||
    (subscription !== '' && !Number.isNaN(new Date(subscription).getTime()) && new Date(subscription) > new Date());

  const isPaidPlan = PAID_PLANS.includes(plan);
  return {
    plan,
    isCenterStudent,
    isPaidPlan,
    isPaid: isPaidPlan || isCenterStudent || subscriptionActive,
  };
}
