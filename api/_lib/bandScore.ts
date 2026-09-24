/**
 * The band-score rules, in one place.
 *
 * The API (api/feedback.ts), the browser (src/pages/FeedbackPage.tsx and the
 * progress, leaderboard and center screens) and the test script
 * (scripts/compare-band-scores.ts) all import this file. Before it existed
 * each kept its own copy, and they drifted: the student saw the overall band
 * the model worked out, while the database stored the one the server worked
 * out, and the progress chart averaged the numbers a third way.
 *
 * It has no imports on purpose, so both builds can use it.
 */

export const CRITERIA = [
  'taskAchievement',
  'coherenceCohesion',
  'lexicalResource',
  'grammaticalRangeAccuracy',
] as const;

export type Criterion = (typeof CRITERIA)[number];

export type BandScores = Record<Criterion, number> & { overall: number };

/**
 * One criterion band as a number from 0 to 9 in half-band steps, or null when
 * the model gave something that is not a number at all.
 */
export function cleanBand(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(9, Math.max(0, Math.round(n * 2) / 2));
}

/**
 * Official IELTS rounding: the mean of the four criteria to the nearest half
 * band, with the exact .25 and .75 cases rounded up (6.25 -> 6.5, 6.75 -> 7.0).
 */
export function overallBand(ta: number, cc: number, lr: number, gra: number): number {
  // Each band as a whole number of half bands, so the maths stays exact.
  const sum = [ta, cc, lr, gra].map((s) => Math.round(s * 2)).reduce((a, b) => a + b, 0);
  const r = sum % 4;
  const halves = r === 0 ? sum / 4 : r === 1 ? (sum - 1) / 4 : (sum + 4 - r) / 4;
  return halves / 2;
}

/**
 * The Writing band for a full test (Task 1 and Task 2). IELTS counts Task 2
 * twice as much as Task 1. This works from the two task bands the student
 * sees on the report, so they can check the sum themselves, and rounds the
 * result the same way as overallBand: to the nearest half band, with .25 and
 * .75 rounding up (6.25 -> 6.5, 6.75 -> 7.0).
 */
export function writingBand(task1Band: number, task2Band: number): { weighted: number; band: number } {
  // Task 1 + 2 x Task 2, counted in half bands so the maths stays exact.
  const h = Math.round(task1Band * 2) + 2 * Math.round(task2Band * 2);
  return {
    weighted: h / 6,
    // The nearest half band to h / 6, rounding up when it sits halfway.
    band: Math.floor((2 * h + 3) / 6) / 2,
  };
}

/**
 * The four criteria cleaned, and the overall band worked out here, never
 * taken from the model's own arithmetic. Null when any criterion is missing,
 * so a broken reply can never turn into a made-up score.
 */
export function normalizeScores(raw: unknown): BandScores | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const [ta, cc, lr, gra] = CRITERIA.map((k) => cleanBand(r[k]));
  if (ta === null || cc === null || lr === null || gra === null) return null;
  return {
    taskAchievement: ta,
    coherenceCohesion: cc,
    lexicalResource: lr,
    grammaticalRangeAccuracy: gra,
    overall: overallBand(ta, cc, lr, gra),
  };
}

/**
 * The one number that stands for a saved report: its overall band. Reports
 * saved before the overall was worked out in code fall back to the stored
 * overall. Null when the report holds no usable score.
 */
export function reportBand(scores: unknown): number | null {
  const s = normalizeScores(scores);
  if (s) return s.overall;
  return cleanBand((scores as { overall?: unknown } | null | undefined)?.overall);
}

/**
 * Pulls the JSON object out of a model reply. The reply should be bare JSON,
 * but a code fence or a stray line before or after it must not cost the
 * student their report.
 */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in the reply.');
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * The official IELTS name for a band. Each name belongs to a whole band, so a
 * half band takes the name of the band below it: 6.5 is a strong "Competent
 * user", not yet a "Good user" (Band 7). Rounding up would flatter the student.
 */
export function bandLabel(score: number): string {
  if (score >= 9) return 'Expert user';
  if (score >= 8) return 'Very good user';
  if (score >= 7) return 'Good user';
  if (score >= 6) return 'Competent user';
  if (score >= 5) return 'Modest user';
  if (score >= 4) return 'Limited user';
  if (score >= 3) return 'Extremely limited user';
  if (score >= 2) return 'Intermittent user';
  if (score >= 1) return 'Non-user';
  return 'Did not attempt';
}
