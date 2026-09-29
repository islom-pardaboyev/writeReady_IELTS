import type { VercelRequest } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { mustConfirmEmail } from './emailGate.js';

// Shared by the api/ routes. The api/ build cannot import from src/, so a few
// rules here mirror src/lib (see src/lib/weeklyFree.ts and src/lib/plans.ts).
// The other way round works for files with no imports: src/ uses
// api/_lib/bandScore.ts directly.

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
  // The site keeps these accounts out too; this stops anyone calling the API
  // straight from an account whose email was never confirmed.
  if (mustConfirmEmail(decoded.firebase.sign_in_provider, decoded.email, decoded.email_verified)) {
    throw new Error('EMAIL_NOT_CONFIRMED');
  }
  return decoded.uid;
}

/** The fixed internal email of the admin account. api/staff-login.ts mints its sign-in token. */
export const ADMIN_EMAIL = 'admin@writeready.internal';

export interface StaffToken {
  uid: string;
  /** Lower-cased, '' when the token has none. */
  email: string;
  /** The token's sign_in_provider: 'custom' for staff, 'password' or 'google.com' for students. */
  provider: string;
}

/** The signed-in person behind an `Authorization: Bearer <ID token>` header, or null for a missing, bad or expired token. */
export async function readStaffToken(req: VercelRequest): Promise<StaffToken | null> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const d = await getAuth().verifyIdToken(token);
    return { uid: d.uid, email: (d.email ?? '').toLowerCase(), provider: d.firebase?.sign_in_provider ?? '' };
  } catch {
    return null;
  }
}

/**
 * Staff sign in with a custom token from api/staff-login.ts, so their token's
 * provider is 'custom'. Anyone can make an account with a staff email through
 * Firebase's public sign-up address, but that account signs in with a
 * 'password' provider and must never count as staff. firestore.rules checks
 * the same two things (isStaff).
 */
export function isAdminToken(t: StaffToken | null): boolean {
  return t !== null && t.provider === 'custom' && t.email === ADMIN_EMAIL;
}

/** The staff token of the learning centre with this id. */
export function isCenterToken(t: StaffToken | null, centerId: string): boolean {
  return t !== null && t.provider === 'custom' && t.email === `center_${centerId}@writeready.internal`.toLowerCase();
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

// Reports a month, by plan. Mirrors PLAN_INFO in src/lib/plans.ts, which this
// build cannot import from. The Customizable plan is not here: its number is
// stored on each student (see customAnalysesOf).
export const PLAN_LIMITS: Record<string, number> = { forever: 9999, premium: 25, standard: 12, basic: 5 };

// The Customizable plan's allowed range. Mirrors CUSTOM_MIN_ANALYSES and
// CUSTOM_MAX_ANALYSES in src/lib/plans.ts.
const CUSTOM_MIN_ANALYSES = 5;
const CUSTOM_MAX_ANALYSES = 25;

/** A Customizable plan's reports a month, or null when the stored number is missing or out of range. */
export function customAnalysesOf(data: Record<string, unknown>): number | null {
  const n = data.customAnalyses;
  return typeof n === 'number' && Number.isInteger(n) && n >= CUSTOM_MIN_ANALYSES && n <= CUSTOM_MAX_ANALYSES ? n : null;
}

// Learning-center students were written as `plan: "pro"` before centers chose
// a plan of their own, and "pro" always meant the premium allowance. Those
// accounts keep it until an admin saves their center, which stamps the
// center's real plan and contract end date onto every student.
const LEGACY_CENTER_PLAN = 'premium';

export interface PaidStatus {
  /** The plan after expiry is applied — 'free' once a paid plan has lapsed. */
  plan: string;
  isCenterStudent: boolean;
  /**
   * Full reports a month on this plan; 0 for free. The only number a route
   * should use for the monthly quota: a Customizable plan's limit lives on the
   * student, not in PLAN_LIMITS.
   */
  monthlyLimit: number;
  /** `plan` is a metered tier, i.e. monthlyLimit > 0. This drives the monthly report quota. */
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
  if (plan === 'pro') plan = LEGACY_CENTER_PLAN;
  // A lifetime `subscription` on an older account means lifetime, whatever
  // `plan` says. effectivePlan() in src/lib/plans.ts reads it the same way;
  // before this, the site showed such a student a Lifetime quota while this
  // route gave them only the free weekly report.
  if (data.subscription === 'forever') plan = 'forever';
  const isCenterStudent = typeof data.centerId === 'string' && data.centerId.length > 0;

  // A paid plan past its expiry reverts to free; nothing else downgrades the
  // stored `plan` field. Lifetime plans never expire. A centre student holds
  // the plan their centre bought and the centre's contract end date, so the
  // same line ends their access when the contract does.
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : '';
  if (plan !== 'forever' && expiresAt && new Date(expiresAt) < new Date()) {
    plan = 'free';
  }

  // A Customizable plan whose number is missing or out of range falls back to
  // free rather than to a paid plan with no reports: the student keeps the
  // weekly free report and any bonus instead of being locked out.
  const custom = plan === 'custom' ? customAnalysesOf(data) : null;
  if (plan === 'custom' && custom === null) plan = 'free';
  const monthlyLimit = plan === 'custom' ? custom! : PLAN_LIMITS[plan] ?? 0;

  const subscription = typeof data.subscription === 'string' ? data.subscription : '';
  const subscriptionActive =
    subscription === 'forever' ||
    (subscription !== '' && !Number.isNaN(new Date(subscription).getTime()) && new Date(subscription) > new Date());

  const isPaidPlan = monthlyLimit > 0;
  return {
    plan,
    isCenterStudent,
    monthlyLimit,
    isPaidPlan,
    // Centre students are not a separate case any more: their profile carries
    // a real plan, so isPaidPlan already covers them while the contract runs.
    isPaid: isPaidPlan || subscriptionActive,
  };
}
