import type { FeedbackReport } from "@/firebase/firestore";

/**
 * The dashboard's progress chart, kept on the device between visits.
 *
 * The chart needs the newest 30 reports, one Firestore read each, on every
 * dashboard visit. The dashboard counts the student's reports anyway (one
 * read however many there are), so a saved chart is reused while that count
 * is unchanged, and fetched again when a report was added or removed. A
 * report finished on this device clears it (FeedbackPage), which also covers
 * a score-only report upgraded to the full one in place. A day-old copy is
 * fetched again regardless.
 */

const KEY = "writeready.progress.v1";
const MAX_AGE = 24 * 60 * 60 * 1000;

interface Saved {
  uid: string;
  count: number;
  at: number;
  reports: (Omit<FeedbackReport, "createdAt"> & { createdAt: number | null })[];
}

export function readProgressCache(uid: string): { count: number; reports: FeedbackReport[] } | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (!s || s.uid !== uid || typeof s.count !== "number" || !Array.isArray(s.reports) || Date.now() - s.at > MAX_AGE) return null;
    return {
      count: s.count,
      reports: s.reports.map((r) => ({ ...r, createdAt: r.createdAt === null ? null : new Date(r.createdAt) })),
    };
  } catch {
    return null;
  }
}

export function saveProgressCache(uid: string, count: number, reports: FeedbackReport[]): void {
  try {
    const saved: Saved = { uid, count, at: Date.now(), reports: reports.map((r) => ({ ...r, createdAt: r.createdAt?.getTime() ?? null })) };
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage full or blocked: the next visit fetches again */
  }
}

export function forgetProgressCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* blocked storage holds nothing to forget */
  }
}
