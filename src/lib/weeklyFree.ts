// Free-plan users get 1 AI feedback report per calendar week (Monday-start,
// ISO week numbering), instead of a single lifetime bonus report.
//
// api/pre-check.ts and api/feedback.ts duplicate `currentWeekKey()` — they
// run as separate Vercel functions with their own build, so they can't
// import from src/.
export const FREE_WEEKLY_LIMIT = 1;

export function currentWeekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export interface FreeUsage {
  weekKey?: string;
  count?: number;
}

export function hasFreeReportThisWeek(freeUsage?: FreeUsage | null): boolean {
  if (!freeUsage || freeUsage.weekKey !== currentWeekKey()) return true;
  return (freeUsage.count ?? 0) < FREE_WEEKLY_LIMIT;
}
