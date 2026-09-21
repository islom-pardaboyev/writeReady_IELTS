import type { Plan } from '../types';

/**
 * What each plan costs and what it gives. One place, so the student's quota,
 * the admin panel and the learning-center calculator can never drift apart.
 *
 * The api/ routes run as separate Vercel functions and cannot import from
 * src/ (see src/lib/weeklyFree.ts), so api/_lib/shared.ts and api/pre-check.ts
 * keep their own copy of these numbers. Change them here and there together.
 *
 * The marketing copy on src/pages/PricingPage.tsx also spells the prices out
 * by hand; keep it in step when a price changes.
 */
export interface PlanInfo {
  id: Plan;
  label: string;
  /** Retail price for one student for one month. */
  monthlyPriceUZS: number;
  /** AI feedback reports the student gets each month. */
  monthlyAnalyses: number;
}

export const PLAN_INFO: Record<Plan, PlanInfo> = {
  free: { id: 'free', label: 'Free', monthlyPriceUZS: 0, monthlyAnalyses: 0 },
  basic: { id: 'basic', label: 'Basic', monthlyPriceUZS: 19_000, monthlyAnalyses: 5 },
  standard: { id: 'standard', label: 'Standard', monthlyPriceUZS: 29_000, monthlyAnalyses: 12 },
  premium: { id: 'premium', label: 'Premium', monthlyPriceUZS: 49_000, monthlyAnalyses: 25 },
  forever: { id: 'forever', label: 'Lifetime', monthlyPriceUZS: 0, monthlyAnalyses: 9999 },
};

export const PAID_PLANS: Plan[] = ['basic', 'standard', 'premium', 'forever'];

/**
 * Learning-center students were written as `plan: "pro"` before centers chose
 * a plan of their own, and "pro" always meant the premium allowance. Those
 * accounts keep exactly what they have until an admin saves their center,
 * which stamps the center's real plan onto every student.
 */
export const LEGACY_CENTER_PLAN: Plan = 'premium';

export function normalizePlan(plan?: string | null): Plan {
  if (plan === 'pro') return LEGACY_CENTER_PLAN;
  if (plan && plan in PLAN_INFO) return plan as Plan;
  return 'free';
}

/** A paid plan past its end date is over. Lifetime plans never expire. */
export function planExpired(plan: Plan, expiresAt?: string | null): boolean {
  if (plan === 'forever' || !expiresAt) return false;
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return false;
  return end < new Date();
}

/**
 * The plan a user doc really grants right now: the stored plan, with "pro"
 * translated and an expired plan dropped back to free. A learning-center
 * student carries their center's plan and their center's end date, so the
 * same rule covers them.
 */
export function effectivePlan(data: {
  plan?: unknown;
  subscription?: unknown;
  expiresAt?: unknown;
}): Plan {
  if (data.subscription === 'forever') return 'forever';
  const plan = normalizePlan(typeof data.plan === 'string' ? data.plan : null);
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : '';
  return planExpired(plan, expiresAt) ? 'free' : plan;
}

/** Reports a month. Free plans get none here — they use the weekly allowance. */
export function monthlyLimitFor(plan: Plan): number {
  return PLAN_INFO[plan].monthlyAnalyses;
}
