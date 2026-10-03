// When a paid plan's monthly report allowance renews.
//
// It used to renew on the 1st of every calendar month, so a plan given on
// 20 May was refilled on 1 June, twelve days in. Now each plan runs month by
// month from its own dates: every plan's end date (`expiresAt`) is a whole
// number of months after the day it was given or last renewed, so stepping
// back from it a month at a time finds the day the plan's current month
// began. A plan given on 20 May renews on 20 June, then 20 July.
//
// Days are UTC calendar days, the clock `new Date("2026-06-20")` reads, which
// is also when such a plan lapses. A plan with no end date (Lifetime) keeps
// the calendar month.
//
// No imports: the site uses this same file through @shared (see
// vite.config.ts), so the number a student sees is the number the API counts.

export interface PlanCycle {
  /**
   * Written as `usage.monthKey` beside the count: the cycle's first day, e.g.
   * "2026-05-20", or "2026-05" for a calendar month.
   */
  key: string;
  /** The cycle's first day, 00:00 UTC. */
  start: Date;
  /** The next cycle's first day, 00:00 UTC: when the allowance refills. */
  renewsAt: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');

const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * The `day`th of month `month` (0-based, may run past 11 or below 0), or the
 * month's last day when it is shorter: 31 January plus a month is 28 February,
 * never 3 March.
 */
function dayOfMonth(year: number, month: number, day: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

/** The day of the month the plan ends on, or null when there is no usable end date. */
function endDayOfMonth(expiresAt: unknown): number | null {
  if (typeof expiresAt !== 'string') return null;
  const match = /^\d{4}-\d{2}-(\d{2})/.exec(expiresAt);
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

/** The month of the plan that holds `now`. */
export function planCycle(expiresAt: unknown, now: Date = new Date()): PlanCycle {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = endDayOfMonth(expiresAt);
  if (day === null) {
    return { key: `${y}-${pad(m + 1)}`, start: new Date(Date.UTC(y, m, 1)), renewsAt: new Date(Date.UTC(y, m + 1, 1)) };
  }
  let start = dayOfMonth(y, m, day);
  if (start.getTime() > now.getTime()) start = dayOfMonth(y, m - 1, day);
  const renewsAt = dayOfMonth(start.getUTCFullYear(), start.getUTCMonth() + 1, day);
  return { key: isoDay(start), start, renewsAt };
}

/**
 * When the allowance next refills, or null when the plan ends first: the
 * allowance then comes back only if the plan is renewed.
 */
export function nextRenewal(expiresAt: unknown, now: Date = new Date()): Date | null {
  const { renewsAt } = planCycle(expiresAt, now);
  const ends = typeof expiresAt === 'string' && endDayOfMonth(expiresAt) !== null ? expiresAt.slice(0, 10) : null;
  return ends !== null && isoDay(renewsAt) >= ends ? null : renewsAt;
}

/**
 * Reports already spent in the plan's current month, from a user's stored
 * `usage` ({ monthKey, count }) and `expiresAt`.
 */
export function usedThisCycle(usage: unknown, expiresAt: unknown, now: Date = new Date()): number {
  if (!usage || typeof usage !== 'object') return 0;
  const { monthKey, count } = usage as { monthKey?: unknown; count?: unknown };
  if (typeof count !== 'number' || !(count > 0)) return 0;
  const cycle = planCycle(expiresAt, now);
  if (monthKey === cycle.key) return count;
  // A count written before plan months existed is keyed by calendar month
  // ("2026-10"). One from this calendar month was spent inside the current
  // cycle when the cycle began on or before the 1st, so it still counts until
  // the cycle renews. An older one was already cleared on the 1st.
  const calendarMonth = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return monthKey === calendarMonth && cycle.start.getTime() <= monthStart ? count : 0;
}

/**
 * The end date for a plan given or renewed today: a month after the later of
 * today and the plan's current end date, as YYYY-MM-DD. Renewing early adds a
 * month to what is left instead of throwing the remaining days away. The day
 * of the month carries over, so the allowance keeps renewing on that day.
 */
export function monthAfter(currentEnd?: string | null, now: Date = new Date()): string {
  const end = currentEnd ? new Date(currentEnd) : null;
  const from = end && !Number.isNaN(end.getTime()) && end > now ? end : now;
  return isoDay(dayOfMonth(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate()));
}
