import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from './db.js';
import { seal, unseal } from './seal.js';
import type { TaskType } from './savedReports.js';

/**
 * The reports a student can download again as a PDF from the dashboard.
 *
 *   report_archive/{reportId}   uid, taskType, createdAt in the clear (for the
 *                               query), and the report, the essay and the
 *                               question sealed together.
 *
 * Premium and Lifetime keep the newest 10, every other paid plan the newest 3,
 * Free none. Saving a new report deletes the ones past the limit, so a
 * student's archive never grows beyond it. A plan that shrinks is trimmed the
 * next time the dashboard lists the archive.
 *
 * The document id is the feedback_reports id, so the dashboard card for a
 * report and its PDF are the same id. Written and read only here, with the
 * Admin SDK; the Firestore rules deny every client.
 */

const ARCHIVE = 'report_archive';

/**
 * Mirrors pdfHistoryLimit in src/lib/plans.ts, which this build cannot import.
 * `plan` is the effective plan (resolvePaidStatus in ./shared.ts).
 */
export function pdfHistoryLimit(plan: string): number {
  if (plan === 'premium' || plan === 'forever') return 10;
  return plan === 'free' ? 0 : 3;
}

/** A chart that rides inside the document. Stored prompt charts are referenced by id instead. */
const MAX_INLINE_CHART = 300_000;

export interface ArchivedReport {
  /** The report JSON exactly as the student received it. */
  raw: string;
  essay: string;
  question: string;
  /** The task1_images id of the prompt's chart, when the prompt had one. */
  chartId?: string;
  /** A chart the student uploaded themselves, when it is small enough to keep. */
  chartImage?: string;
}

const millis = (d: QueryDocumentSnapshot) => d.get('createdAt')?.toMillis?.() ?? 0;

/**
 * The student's archive, newest first. Queried by uid alone and sorted here:
 * there are never more than a handful, and it needs no composite index.
 */
async function archiveOf(uid: string): Promise<QueryDocumentSnapshot[]> {
  const snap = await db().collection(ARCHIVE).where('uid', '==', uid).select('createdAt').get();
  return [...snap.docs].sort((a, b) => millis(b) - millis(a));
}

/** Deletes every entry past the newest `limit`, and returns the ids that stay. */
async function trim(uid: string, limit: number): Promise<string[]> {
  const docs = await archiveOf(uid);
  const extra = docs.slice(limit);
  if (extra.length) {
    const batch = db().batch();
    extra.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.slice(0, limit).map((d) => d.id);
}

/**
 * Keeps a full report for download, then drops the oldest past the plan's
 * limit. Upgrading the score-only report on an essay reuses its id, so it
 * replaces that entry rather than adding one.
 */
export async function archiveReport(
  uid: string, reportId: string, taskType: TaskType, limit: number, report: ArchivedReport,
): Promise<void> {
  if (limit <= 0) return;
  const kept: ArchivedReport = {
    raw: report.raw,
    essay: report.essay,
    question: report.question,
    ...(report.chartId ? { chartId: report.chartId } : {}),
    ...(!report.chartId && report.chartImage && report.chartImage.length <= MAX_INLINE_CHART
      ? { chartImage: report.chartImage } : {}),
  };
  await db().collection(ARCHIVE).doc(reportId).set({
    uid,
    taskType,
    sealed: seal(kept, `${ARCHIVE}/${reportId}`),
    createdAt: FieldValue.serverTimestamp(),
  });
  await trim(uid, limit);
}

/** The ids the student may download now, trimmed to the plan they have today. */
export async function listArchive(uid: string, limit: number): Promise<string[]> {
  return trim(uid, limit);
}

/** One archived report, or null when it is not this student's or no longer kept. */
export async function loadArchived(uid: string, reportId: string, limit: number): Promise<(ArchivedReport & { taskType: TaskType }) | null> {
  const ids = await listArchive(uid, limit);
  if (!ids.includes(reportId)) return null;
  const snap = await db().collection(ARCHIVE).doc(reportId).get();
  if (!snap.exists || snap.get('uid') !== uid) return null;
  const r = unseal<ArchivedReport>(snap.get('sealed'), `${ARCHIVE}/${reportId}`);
  if (!r || typeof r.raw !== 'string' || typeof r.essay !== 'string' || typeof r.question !== 'string') return null;
  const taskType: TaskType = snap.get('taskType') === 'Task 1' ? 'Task 1' : 'Task 2';
  return { ...r, taskType };
}
