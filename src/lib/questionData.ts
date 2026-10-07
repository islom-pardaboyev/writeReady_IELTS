/**
 * The public sample-answer pages: /questions and /questions/:taskType/:slug.
 *
 * scripts/prerender-questions.tsx builds every page once a day from the
 * published samples: the HTML (for search engines and a fast first paint),
 * and the same data as JSON under /question-data/, which the app reads when a
 * student moves between pages. Nothing here touches Firestore, so these pages
 * cost no database reads however many people open them.
 *
 * No imports: the build script and the browser both use this file.
 */

export const SITE_URL = 'https://www.writeready.uz';
/** The band an essay needs to be offered as a sample (api/_lib/samples/qualify.ts). */
export const MIN_SAMPLE_BAND = 7;

export type QuestionTask = 'task1' | 'task2';

export interface PublicCriteria {
  taskScore: number;
  cc: number;
  lr: number;
  gra: number;
}

export interface PublicVocab {
  word: string;
  meaning: string;
  uz: string;
  example: string;
}

export interface PublicSample {
  id: string;
  sourceType: 'student' | 'ai';
  band: number;
  criteria: PublicCriteria | null;
  /** Student samples: the writing mode. */
  mode?: string;
  sampleAnswer: string;
  wordCount: number;
}

export interface QuestionImage {
  /** Site path, e.g. /question-images/line-graph-energy-consumption.jpg */
  src: string;
  kind: 'image' | 'pdf';
  width: number;
  height: number;
  alt: string;
}

export interface QuestionSummary {
  slug: string;
  taskType: QuestionTask;
  title: string;
  topic: string;
  chartType?: string;
  /** The question's first sentence or so, for the list. */
  excerpt: string;
  bestBand: number;
  sampleCount: number;
  hasStudentSample: boolean;
}

export interface QuestionPageData {
  questionId: string;
  slug: string;
  taskType: QuestionTask;
  /** A question a student typed in Relax: written again in Relax, not Quick Write. */
  custom?: boolean;
  title: string;
  topic: string;
  chartType?: string;
  questionText: string;
  image: QuestionImage | null;
  /** Student answers first, then model answers; best band first within each. */
  samples: PublicSample[];
  outline: string[];
  vocabulary: PublicVocab[];
  grammarHighlights: string[];
  related: QuestionSummary[];
  sourceCredit?: string;
  publishedAt: string;
  updatedAt: string;
}

export interface QuestionIndexData {
  questions: QuestionSummary[];
  topics: string[];
  generatedAt: string;
}

export const questionPath = (taskType: QuestionTask, slug: string) => `/questions/${taskType}/${slug}`;
export const questionDataPath = (taskType: QuestionTask, slug: string) => `/question-data/${taskType}/${slug}.json`;
export const QUESTION_INDEX_PATH = '/question-data/index.json';

/** The id of the <script type="application/json"> the build puts each page's data in. */
export const EMBEDDED_DATA_ID = 'question-page-data';

export const taskLabel = (t: QuestionTask) => (t === 'task1' ? 'Task 1' : 'Task 2');
export const fmtBand = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'over', 'the', 'to', 'vs', 'with']);

/** "energy consumption in the USA" -> "Energy Consumption in the USA" (acronyms kept). */
export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (/[A-Z].*[A-Z]/.test(w)) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** "IELTS Writing Task 1: Line Graph — Energy Consumption — Band 8 Sample Answer" */
export function pageTitle(d: Pick<QuestionPageData, 'taskType' | 'title' | 'chartType' | 'samples'>): string {
  const best = Math.max(...d.samples.map((s) => s.band));
  const parts = [`IELTS Writing ${taskLabel(d.taskType)}: ${d.taskType === 'task1' && d.chartType ? `${titleCase(d.chartType)} — ` : ''}${titleCase(d.title)}`];
  parts.push(`Band ${fmtBand(best)} Sample Answer`);
  return parts.join(' — ');
}

export function pageDescription(d: Pick<QuestionPageData, 'taskType' | 'questionText' | 'samples' | 'vocabulary'>): string {
  const best = Math.max(...d.samples.map((s) => s.band));
  const kinds = [
    d.samples.some((s) => s.sourceType === 'student') ? 'a real student answer' : '',
    d.samples.some((s) => s.sourceType === 'ai') ? 'a model answer' : '',
  ].filter(Boolean).join(' and ');
  const question = d.questionText.replace(/\s+/g, ' ').trim();
  const lead = `Band ${fmtBand(best)} IELTS Writing ${taskLabel(d.taskType)} sample: ${kinds}`;
  const extra = d.vocabulary.length ? ', with vocabulary in Uzbek and grammar notes' : '';
  const room = 158 - lead.length - extra.length - 4;
  const shortQ = question.length > room ? `${question.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '')}…` : question;
  return `${lead}${extra}. ${shortQ}`;
}

/** The question's opening, for the list. */
export function excerptOf(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** The Quick Write address that opens this question, chart and all. */
export const writeItPath = (taskType: QuestionTask, questionId: string) =>
  `/writing/quick?task=${taskType === 'task1' ? 1 : 2}&q=${encodeURIComponent(questionId)}`;

/**
 * Where "Write your own answer" goes: Quick Write for a bank question; Relax,
 * filled in from this page's data, for a question a student typed (it is not
 * in the bank Quick Write draws from).
 */
export const writeItPathFor = (d: Pick<QuestionPageData, 'taskType' | 'questionId' | 'slug' | 'custom'>) =>
  d.custom ? `/writing/relax?from=${d.taskType}/${encodeURIComponent(d.slug)}` : writeItPath(d.taskType, d.questionId);
