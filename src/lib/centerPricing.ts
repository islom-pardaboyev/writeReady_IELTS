import type { Plan } from '../types';
import { PLAN_INFO, normalizePlan } from './plans';

/**
 * What a learning center pays for its student places.
 *
 * A center buys one plan for all of its students, the same way a shop buys a
 * box of the same thing: the more places it takes, the less each place costs.
 * The ladder below is the price list. Everything else here is arithmetic on
 * top of it, so the admin panel only has to show the result.
 */

/** Centers buy a metered plan; Free and Lifetime are not sold by the seat. */
export type CenterPlanId = Extract<Plan, 'basic' | 'standard' | 'premium'>;

export const CENTER_PLAN_IDS: CenterPlanId[] = ['basic', 'standard', 'premium'];

/** Centers added before plans existed were all given the premium allowance. */
export const DEFAULT_CENTER_PLAN: CenterPlanId = 'premium';

export function centerPlanOf(id?: string | null): CenterPlanId {
  const plan = normalizePlan(id);
  return (CENTER_PLAN_IDS as Plan[]).includes(plan) ? (plan as CenterPlanId) : DEFAULT_CENTER_PLAN;
}

export function centerPlanInfo(id?: string | null) {
  return PLAN_INFO[centerPlanOf(id)];
}

export interface SeatTier {
  /** The tier starts at this many places. */
  minSeats: number;
  /** Taken off every place in the order, as a percent. */
  percent: number;
}

/** The price list. Read it as "from N places, every place costs X% less". */
export const SEAT_TIERS: SeatTier[] = [
  { minSeats: 1, percent: 0 },
  { minSeats: 10, percent: 10 },
  { minSeats: 25, percent: 20 },
  { minSeats: 50, percent: 30 },
  { minSeats: 100, percent: 40 },
];

/** The most an admin may knock off by hand, on top of the ladder. */
export const MAX_EXTRA_DISCOUNT = 50;

/**
 * What the AI costs for one full report, in so'm: about $0.12 at 12,500 so'm
 * a dollar. It is an estimate made on 8 October 2026 from the prompts and the
 * production logs, not a measured bill; update it once real numbers are in.
 */
export const AI_COST_PER_REPORT_UZS = 1_500;

/**
 * The least one place can cost for a month: what the AI costs when the student
 * uses every report the plan gives. Discounts stop here. Before, the ladder and
 * the extra discount together could take a Premium place to 14,700 so'm, about
 * half of what its 25 reports cost to write. Whole thousands, like invoices.
 */
export function floorPerSeatMonthUZS(planId?: string | null): number {
  return Math.ceil((centerPlanInfo(planId).monthlyAnalyses * AI_COST_PER_REPORT_UZS) / 1000) * 1000;
}

export function tierFor(seats: number): SeatTier {
  let match = SEAT_TIERS[0];
  for (const tier of SEAT_TIERS) if (seats >= tier.minSeats) match = tier;
  return match;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

/** Invoices are written in whole thousands, so quotes are too. */
const roundUZS = (n: number) => Math.round(n / 1000) * 1000;

const DAY = 86_400_000;
const AVERAGE_MONTH_DAYS = 30.44;

/** Months from today to a contract end date, for the price. Null if it passed. */
export function monthsUntil(endISO?: string | null, fromISO?: string | null): number | null {
  if (!endISO) return null;
  const end = new Date(endISO);
  const from = fromISO ? new Date(fromISO) : new Date();
  if (Number.isNaN(end.getTime()) || Number.isNaN(from.getTime())) return null;
  const days = (end.getTime() - from.getTime()) / DAY;
  if (days <= 0) return null;
  return clamp(days / AVERAGE_MONTH_DAYS, 1, 120);
}

/** The date a contract of this many months ends, as yyyy-mm-dd. */
export function endDateAfterMonths(months: number, fromISO?: string | null): string {
  const from = fromISO ? new Date(fromISO) : new Date();
  const base = Number.isNaN(from.getTime()) ? new Date() : from;
  const end = new Date(base);
  end.setMonth(end.getMonth() + clamp(months, 1, 120));
  return end.toISOString().slice(0, 10);
}

export interface CenterQuoteInput {
  planId?: string | null;
  seats: number;
  months: number;
  /** Hand-typed discount for a negotiated deal, as a percent. */
  extraPercent?: number;
}

export interface CenterQuote {
  planId: CenterPlanId;
  seats: number;
  months: number;
  /** Full price, before any discount. */
  listTotalUZS: number;
  /** What the seat ladder took off, as a percent. */
  tierPercent: number;
  extraPercent: number;
  totalUZS: number;
  /** What one place costs for one month, after everything. */
  perSeatMonthUZS: number;
  savingUZS: number;
  /** The lowest price of one place for one month on this plan (floorPerSeatMonthUZS). */
  floorPerSeatMonthUZS: number;
  /** What was added to bring the discounted total up to that floor; 0 when it was above it. */
  raisedToFloorUZS: number;
  /** The order size whose bulk discount was used: `seats`, or a bigger tier that costs less. */
  pricedAsSeats: number;
  /**
   * Set when the next tier down the ladder costs no more than this order, so
   * the center can have the extra places for the same money.
   */
  freeSeats: { seats: number; extra: number } | null;
}

function ladderTotal(monthlyPriceUZS: number, seats: number, months: number): number {
  return monthlyPriceUZS * seats * months * (1 - tierFor(seats).percent / 100);
}

/**
 * Prices one contract.
 *
 * The ladder has steps, so a big order in a low tier can cost more than a
 * slightly bigger one in the next tier — 24 places at 10% off cost more than
 * 25 at 20% off. A center should never pay more for buying less, so the quote
 * takes the cheapest price its size can reach and says how many places come
 * free with it. No place is priced under the floor (floorPerSeatMonthUZS):
 * the floor applies to the places the center takes, and places are only
 * offered free when they too stay at or above it.
 */
export function quoteCenter({ planId, seats, months, extraPercent = 0 }: CenterQuoteInput): CenterQuote {
  const plan = centerPlanInfo(planId);
  const s = clamp(seats, 1, 10_000);
  const m = clamp(months, 1, 120);
  const extra = clamp(extraPercent, 0, MAX_EXTRA_DISCOUNT);
  const floor = floorPerSeatMonthUZS(planId);
  const discounted = (n: number) => ladderTotal(plan.monthlyPriceUZS, n, m) * (1 - extra / 100);

  const listTotal = plan.monthlyPriceUZS * s * m;
  let pricedAs = s;
  let cheapest = discounted(s);
  for (const tier of SEAT_TIERS) {
    if (tier.minSeats <= s) continue;
    const total = discounted(tier.minSeats);
    if (total < cheapest) {
      cheapest = total;
      pricedAs = tier.minSeats;
    }
  }

  // The floor is a whole number of thousands, so rounding never takes a total under it.
  const best = Math.max(cheapest, floor * s * m);
  const totalUZS = roundUZS(best);

  return {
    planId: centerPlanOf(planId),
    seats: s,
    months: m,
    listTotalUZS: listTotal,
    tierPercent: listTotal > 0 ? Math.round((1 - ladderTotal(plan.monthlyPriceUZS, pricedAs, m) / listTotal) * 100) : 0,
    extraPercent: extra,
    totalUZS,
    perSeatMonthUZS: Math.round(totalUZS / s / m),
    savingUZS: Math.max(0, listTotal - totalUZS),
    floorPerSeatMonthUZS: floor,
    raisedToFloorUZS: Math.max(0, totalUZS - roundUZS(cheapest)),
    pricedAsSeats: pricedAs,
    freeSeats: pricedAs > s && floor * pricedAs * m <= best ? { seats: pricedAs, extra: pricedAs - s } : null,
  };
}
