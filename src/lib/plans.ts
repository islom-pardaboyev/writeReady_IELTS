import type { Plan } from '../types';

/**
 * What each plan costs and what it gives. One place, so the student's quota,
 * the admin panel and the learning-center calculator can never drift apart.
 *
 * The api/ routes run as separate Vercel functions and cannot import from
 * src/ (see src/lib/weeklyFree.ts), so api/_lib/shared.ts keeps its own copy
 * of these numbers. Change them here and there together.
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
  // Price and reports vary per student: see CUSTOM_PLAN_PRICES and the
  // student's `customAnalyses`. Read its limit through monthlyLimitOf(), never
  // from here.
  custom: { id: 'custom', label: 'Customizable', monthlyPriceUZS: 0, monthlyAnalyses: 0 },
  forever: { id: 'forever', label: 'Lifetime', monthlyPriceUZS: 0, monthlyAnalyses: 9999 },
};

export const PAID_PLANS: Plan[] = ['basic', 'standard', 'premium', 'custom', 'forever'];

/** Every plan but Free. `plan` must already be the effective one (see effectivePlan). */
export const isPaidPlan = (plan: Plan | undefined): boolean => !!plan && plan !== 'free';

/**
 * The Customizable plan: a student picks any number of reports a month in
 * this range. api/_lib/shared.ts keeps the same two numbers.
 */
export const CUSTOM_MIN_ANALYSES = 5;
export const CUSTOM_MAX_ANALYSES = 25;

/**
 * The price for each count. A straight line between the three fixed plans
 * (5 → 19,000; 12 → 29,000; 25 → 49,000), rounded to the nearest 500 UZS, so
 * the per-report price keeps falling smoothly. Kept as a table rather than a
 * formula so every price is one a person has seen and agreed to. Recheck it
 * when a fixed plan's price changes.
 */
export const CUSTOM_PLAN_PRICES: { analyses: number; price: number }[] = [
  { analyses: 5, price: 19_000 },
  { analyses: 6, price: 20_500 },
  { analyses: 7, price: 22_000 },
  { analyses: 8, price: 23_500 },
  { analyses: 9, price: 24_500 },
  { analyses: 10, price: 26_000 },
  { analyses: 11, price: 27_500 },
  { analyses: 12, price: 29_000 },
  { analyses: 13, price: 30_500 },
  { analyses: 14, price: 32_000 },
  { analyses: 15, price: 33_500 },
  { analyses: 16, price: 35_000 },
  { analyses: 17, price: 36_500 },
  { analyses: 18, price: 38_000 },
  { analyses: 19, price: 40_000 },
  { analyses: 20, price: 41_500 },
  { analyses: 21, price: 43_000 },
  { analyses: 22, price: 44_500 },
  { analyses: 23, price: 46_000 },
  { analyses: 24, price: 47_500 },
  { analyses: 25, price: 49_000 },
];

export const customPriceFor = (analyses: number): number =>
  CUSTOM_PLAN_PRICES.find((p) => p.analyses === analyses)?.price ?? 0;

/** A Customizable plan's reports a month, or null when the stored number is missing or out of range. */
export function customAnalysesOf(data: { customAnalyses?: unknown }): number | null {
  const n = data.customAnalyses;
  return typeof n === 'number' && Number.isInteger(n) && n >= CUSTOM_MIN_ANALYSES && n <= CUSTOM_MAX_ANALYSES ? n : null;
}

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
  customAnalyses?: unknown;
}): Plan {
  if (data.subscription === 'forever') return 'forever';
  const plan = normalizePlan(typeof data.plan === 'string' ? data.plan : null);
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : '';
  if (planExpired(plan, expiresAt)) return 'free';
  // A Customizable plan without a valid number falls back to free, never to a
  // paid plan with no reports, so the student keeps the weekly free report.
  // resolvePaidStatus() in api/_lib/shared.ts applies the same rule.
  if (plan === 'custom' && customAnalysesOf(data) === null) return 'free';
  return plan;
}

/**
 * Reports a month the stored fields grant right now: 0 for free (they use the
 * weekly allowance instead). Takes the whole user doc, because a Customizable
 * plan's number is stored on the student, not in PLAN_INFO.
 */
export function monthlyLimitOf(data: Parameters<typeof effectivePlan>[0]): number {
  const plan = effectivePlan(data);
  return plan === 'custom' ? customAnalysesOf(data) ?? 0 : PLAN_INFO[plan].monthlyAnalyses;
}
