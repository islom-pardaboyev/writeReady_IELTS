import { reportBand } from '@shared/bandScore';

/**
 * The figures at the top of the dashboard, worked out from the reports the
 * page already loads for the progress chart (the newest 30, see
 * getProgressReports) and the student's activity document. A student with
 * more reports than that has older ones outside the window, which only the
 * best band could miss.
 */

export interface StatReport {
  taskType: string;
  scores: Record<string, number>;
  createdAt: Date | null;
}

export interface DayActivity {
  /** Local midnight of the day. */
  date: Date;
  count: number;
  isToday: boolean;
}

export interface DashboardStats {
  /** Average overall band of the last few scored reports; null before the first one. */
  currentBand: number | null;
  /** How many scored reports that average covers (up to RECENT). */
  currentFrom: number;
  bestBand: number | null;
  bestReport: StatReport | null;
  /** Consecutive days with a report, ending today, or yesterday if today has none yet. */
  streak: number;
  bestStreak: number;
  wroteToday: boolean;
  /** Reports this calendar month, within the loaded window. */
  thisMonth: number;
  /** The last 14 days, oldest first, today last. */
  days: DayActivity[];
  task1Average: number | null;
  task2Average: number | null;
}

/** Id of the progress charts, so the "Full analytics" link can jump to them. */
export const PROGRESS_ID = 'progress';

/** Whether the progress charts have enough to draw: two scored reports make a trend. */
export const hasProgress = (reports: StatReport[]) =>
  reports.filter((r) => reportBand(r.scores) !== null).length >= 2;

/** Reports averaged for the current band: recent enough to move with the student. */
export const RECENT = 5;
const DAY_COUNT = 14;

export const isTask1 = (taskType: string | undefined) => (taskType ?? '').includes('1');

/**
 * The student's own calendar day, "2026-09-28". It is also the key in the
 * activity document (src/lib/activity.ts), so the format must not change.
 */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const dayKey = localDayKey;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * `reports` oldest first, as getProgressReports returns them. `finished` is
 * the activity document's essays finished per day (src/lib/activity.ts).
 */
export function dashboardStats(reports: StatReport[], now = new Date(), finished: Record<string, number> = {}): DashboardStats {
  const scored = reports.flatMap((r) => {
    const band = reportBand(r.scores);
    return band === null ? [] : [{ report: r, band }];
  });

  const recent = scored.slice(-RECENT);
  const currentBand = average(recent.map((s) => s.band));

  let best: (typeof scored)[number] | null = null;
  for (const s of scored) if (!best || s.band >= best.band) best = s;

  // A day counts when the student finished an essay (saved its PDF) or had
  // one checked (a report, which the Telegram bot makes too). The same essay
  // is usually both, so a day's figure is the larger of the two, not the sum.
  const checked = new Map<string, number>();
  for (const r of reports) {
    if (!r.createdAt) continue;
    const key = dayKey(r.createdAt);
    checked.set(key, (checked.get(key) ?? 0) + 1);
  }
  const perDay = new Map(checked);
  for (const [key, n] of Object.entries(finished)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof n === 'number' && n > 0) perDay.set(key, Math.max(perDay.get(key) ?? 0, n));
  }

  const today = startOfDay(now);
  const wroteToday = perDay.has(dayKey(today));

  let streak = 0;
  for (let d = wroteToday ? today : addDays(today, -1); perDay.has(dayKey(d)); d = addDays(d, -1)) streak++;

  // Longest run of consecutive days anywhere in the data. The keys sort as
  // dates because they are zero-padded.
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...perDay.keys()].sort()) {
    const [y, m, d] = key.split('-').map(Number);
    run = prev && dayKey(addDays(new Date(y, m - 1, d), -1)) === prev ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = key;
  }

  const thisMonth = reports.filter(
    (r) => r.createdAt && r.createdAt.getFullYear() === now.getFullYear() && r.createdAt.getMonth() === now.getMonth(),
  ).length;

  const days: DayActivity[] = [];
  for (let i = DAY_COUNT - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    days.push({ date, count: perDay.get(dayKey(date)) ?? 0, isToday: i === 0 });
  }

  return {
    currentBand,
    currentFrom: recent.length,
    bestBand: best?.band ?? null,
    bestReport: best?.report ?? null,
    streak,
    bestStreak: Math.max(bestStreak, streak),
    wroteToday,
    thisMonth,
    days,
    task1Average: average(scored.filter((s) => isTask1(s.report.taskType)).map((s) => s.band)),
    task2Average: average(scored.filter((s) => !isTask1(s.report.taskType)).map((s) => s.band)),
  };
}

/** The IELTS name for a band ("Competent user" for 6 to 6.5). */
export function bandDescriptor(band: number): string {
  const names = ['Non-user', 'Non-user', 'Intermittent user', 'Extremely limited user', 'Limited user', 'Modest user', 'Competent user', 'Good user', 'Very good user', 'Expert user'];
  return names[Math.max(0, Math.min(9, Math.floor(band)))];
}

/**
 * The next half band above `band`, and how far along the way to it `band` is
 * (0 to 1). Null at band 9, where there is nowhere left to go.
 */
export function nextHalfBand(band: number): { next: number; progress: number; toGo: number } | null {
  if (band >= 9) return null;
  const floor = Math.floor(band * 2) / 2;
  const next = floor + 0.5;
  return { next, progress: (band - floor) / 0.5, toGo: next - band };
}
