import { db } from '../db.js';
import { essayKeys } from '../savedReports.js';
import { CHARTS, CUSTOM_QUESTIONS, isCustomQuestionId, type SampleTaskType } from './model.js';

/**
 * The two places a sample's question can live: the bank (task1_reports /
 * task2_reports, charts in task1_images), or customQuestions, for a question
 * a student typed in Relax. Everything that needs a question's chart or text
 * by id goes through here.
 */

const label = (t: SampleTaskType) => (t === 'task1' ? 'Task 1' : 'Task 2');

/** Same text, same key: normalised like an essay's question (api/_lib/savedReports.ts). */
export const questionKeyOf = (taskType: SampleTaskType, question: string) => essayKeys(label(taskType), question, '').questionKey;

/** The question's chart as a data URL, or null when it has none. */
export async function loadChartDataUrl(questionId: string): Promise<string | null> {
  const snap = isCustomQuestionId(questionId)
    ? await db().collection(CUSTOM_QUESTIONS).doc(questionId).get()
    : await db().collection(CHARTS).doc(questionId).get();
  const data = snap.exists ? snap.get(isCustomQuestionId(questionId) ? 'chart' : 'data') : undefined;
  return typeof data === 'string' && data ? data : null;
}

export interface CustomQuestion {
  id: string;
  text: string;
  hasChart: boolean;
}

/** A custom question already shared with this exact wording, so its samples share one page. */
export async function findCustomQuestion(taskType: SampleTaskType, question: string): Promise<CustomQuestion | null> {
  const snap = await db().collection(CUSTOM_QUESTIONS).where('questionKey', '==', questionKeyOf(taskType, question)).limit(3).get();
  const doc = snap.docs.find((d) => d.get('taskType') === taskType);
  if (!doc) return null;
  return { id: doc.id, text: String(doc.get('text') ?? ''), hasChart: typeof doc.get('chart') === 'string' && !!doc.get('chart') };
}

/** A chart a student uploaded, checked before it is stored: an image or a PDF as a data URL, small enough. */
export function readUploadedChart(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string' || raw.length > max) return null;
  return /^data:(image\/jpeg|image\/png|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw) ? raw : null;
}
