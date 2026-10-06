import { z } from 'zod';

/**
 * Public sample answers: one or more per question in the question bank.
 *
 * Two kinds:
 *   'student'  a student's own Band 7+ essay, shared anonymously from the
 *              feedback page (./consent.ts)
 *   'ai'       a model answer written by Claude Haiku in the daily batch
 *              (./generate.ts)
 *
 * Both wait as 'pending' until the admin taps Approve in Telegram
 * (./review.ts). Only 'published' samples ever reach the public pages, which
 * are built once a day (scripts/prerender-questions.tsx).
 *
 * Every collection here is written by the server alone, with the Admin SDK.
 * firestore.rules has no rule for them, so no browser can read or write them.
 */

export const SAMPLES = 'samples';
/** A student's share, with the private userId the public sample never carries. Same id as its sample. */
export const SUBMISSIONS = 'sampleSubmissions';
/** Per question: slug, title, topic, chart type, alt text. */
export const QUESTION_META = 'questionMeta';
/** One document per slug ever handed out, so two questions can never share one. */
export const SLUGS = 'slugs';
/** The student's answer for one essay: never asked twice. */
export const CONSENTS = 'sampleConsents';
/** One per consent action that earned the free assessment. */
export const CREDITS = 'sampleCredits';
/** Consent actions per student per day. */
export const CONSENT_LIMITS = 'sampleConsentLimits';
/** Questions waiting for a new AI draft (Regenerate) or for their metadata. */
export const QUEUE = 'sampleQueue';
/** One per Message Batch: what was asked, what it cost. */
export const RUNS = 'generationRuns';
/** config/samples: when the deploy hook last ran. */
export const CONFIG_COLLECTION = 'config';
export const CONFIG_DOC = 'samples';

/** The question bank (written by the admin panel, src/pages/writing/admin/PromptsSection.tsx). */
export const BANK = { task1: 'task1_reports', task2: 'task2_reports' } as const;
/** Task 1 charts, one data URL per question (src/lib/task1Chart.ts). */
export const CHARTS = 'task1_images';
/**
 * Questions students typed themselves in Relax and shared a Band 7+ essay
 * on, with their own chart for Task 1. They get a public page like a bank
 * question once a sample on them is approved, but never join the bank the
 * writing modes practise from. Ids start with "cq_".
 */
export const CUSTOM_QUESTIONS = 'customQuestions';
export const isCustomQuestionId = (id: string) => id.startsWith('cq_');
/** A Relax chart travels in the report link at up to ~150 KB (src/lib/task1Chart.ts); this leaves room. */
export const MAX_CUSTOM_CHART_CHARS = 400_000;

export const SITE = 'https://www.writeready.uz';

/**
 * Credit for the question bank's sources, the same line the writing modes show
 * under each question (src/components/writing/PromptSource.tsx). The bank does
 * not record which channel each question came from, so every bank question
 * carries both.
 */
export const BANK_SOURCE_CREDIT = 'CDI_Report / Tushgan_Writing';

/** Where the build puts a question's chart (scripts/prerender-questions.tsx). Never expires. */
export function imageUrlFor(slug: string, ext: 'jpg' | 'png' | 'pdf' = 'jpg'): string {
  return `${SITE}/question-images/${slug}.${ext}`;
}

/** A data URL's file type, as the build writes it. */
export function chartExt(dataUrl: string): 'jpg' | 'png' | 'pdf' | null {
  const type = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i.exec(dataUrl)?.[1]?.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'application/pdf') return 'pdf';
  return null;
}

export type SampleTaskType = 'task1' | 'task2';
export type SampleMode = 'mock' | 'practice' | 'quickwrite' | 'relax';
export type SampleSource = 'student' | 'ai';
export type SampleStatus = 'pending' | 'published' | 'rejected' | 'needs_manual';

export const MODES: readonly SampleMode[] = ['mock', 'practice', 'quickwrite', 'relax'];
export const MODE_LABEL: Record<SampleMode, string> = {
  mock: 'Mock',
  practice: 'Practice',
  quickwrite: 'Quick Write',
  relax: 'Relax',
};

/** Band for each criterion. taskScore is Task Achievement (Task 1) or Task Response (Task 2). */
export interface Criteria {
  taskScore: number;
  cc: number;
  lr: number;
  gra: number;
}

export interface SampleVocab {
  word: string;
  meaning: string;
  uz: string;
  example: string;
}

export interface Sample {
  questionId: string;
  /** Empty until the question has metadata (./slug.ts); the page needs it, the review does not. */
  slug: string;
  taskType: SampleTaskType;
  questionText: string;
  /** Task 1: the chart's public address, https://www.writeready.uz/question-images/<slug>.jpg. */
  imageUrl?: string;
  imageAlt?: string;
  sourceType: SampleSource;
  sampleAnswer: string;
  band: number;
  /** A student's marked bands. Null for an AI draft, which is not assessed. */
  criteria: Criteria | null;
  wordCount: number;
  outline: string[];
  vocabulary: SampleVocab[];
  grammarHighlights: string[];
  /** Student samples only. */
  mode?: SampleMode;
  /** 'custom': a question the student typed in Relax (CUSTOM_QUESTIONS). Absent for the bank. */
  questionSource?: 'bank' | 'custom';
  status: SampleStatus;
  sourceCredit?: string;
  createdAt: unknown;
  updatedAt: unknown;
  publishedAt?: unknown;
}

// ── Topics ───────────────────────────────────────────────────────────────────
// A fixed list, so the topic filter and "related questions" group questions
// the same way every time. The model must pick one of these.

export const TOPICS = [
  'Education',
  'Technology',
  'Environment',
  'Energy',
  'Health',
  'Work',
  'Economy & Business',
  'Society',
  'Crime & Law',
  'Government',
  'Media & Advertising',
  'Transport',
  'Cities & Housing',
  'Culture & Arts',
  'Family & Children',
  'Science',
  'Tourism',
  'Sport & Leisure',
  'Food & Agriculture',
  'Population',
  'Globalisation',
  'Language',
  'Other',
] as const;
export type Topic = (typeof TOPICS)[number];

export const CHART_TYPES = ['Line graph', 'Bar chart', 'Pie chart', 'Table', 'Map', 'Process', 'Mixed charts'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

// ── Word counts ──────────────────────────────────────────────────────────────

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** What an AI draft must come in at, or it is never published. The prompt asks for a little less. */
export const WORD_RANGE: Record<SampleTaskType, [number, number]> = {
  task1: [160, 200],
  task2: [260, 320],
};

// ── The AI's reply ───────────────────────────────────────────────────────────

const text = z.string().trim().min(1);

export const vocabSchema = z
  .object({
    word: text.max(80),
    meaning: text.max(300),
    uz: text.max(200),
    example: text.max(400),
  })
  .refine((v) => v.uz.toLowerCase() !== v.word.toLowerCase(), {
    message: 'the Uzbek translation only repeats the English word',
    path: ['uz'],
  });

const metaFields = {
  /** 2-6 words naming the subject, e.g. "Children and technology". Becomes the slug. */
  title: text.max(80),
  topic: z.enum(TOPICS),
};
const task1MetaFields = {
  chartType: z.enum(CHART_TYPES),
  /** What the chart shows, e.g. "Line graph showing energy consumption in the USA from 1980 to 2030". */
  imageAlt: text.min(15).max(250),
};

/**
 * A model answer, checked before it can go anywhere. Anything that fails is
 * saved as 'needs_manual' with the reasons, and is never sent for approval.
 * The word count is counted here, never taken from the model's own number.
 */
export function draftSchema(taskType: SampleTaskType) {
  const [min, max] = WORD_RANGE[taskType];
  const base = z.object({
    sampleAnswer: text.refine(
      (s) => {
        const n = countWords(s);
        return n >= min && n <= max;
      },
      (s) => ({ message: `the answer is ${countWords(s)} words; it must be ${min}-${max}` }),
    ),
    band: z.number().min(0).max(9),
    wordCount: z.number().int().nonnegative(),
    outline: z.array(text.max(300)).min(2).max(8),
    vocabulary: z.array(vocabSchema).min(8, 'fewer than 8 vocabulary items').max(12, 'more than 12 vocabulary items'),
    grammarHighlights: z.array(text.max(400)).min(2).max(6),
    ...metaFields,
  });
  return taskType === 'task1' ? base.extend(task1MetaFields) : base;
}

export type Draft = z.infer<ReturnType<typeof draftSchema>> & { chartType?: ChartType; imageAlt?: string };

/**
 * For a student's essay: the question's metadata (when it has none yet), and
 * an outline and grammar notes of the essay as written. The essay itself is
 * never rewritten.
 */
export function enrichSchema(taskType: SampleTaskType) {
  const base = z.object({
    outline: z.array(text.max(300)).min(2).max(8),
    grammarHighlights: z.array(text.max(400)).min(2).max(6),
    ...metaFields,
  });
  // The chart may be missing for a student's Task 1; the alt text is then empty and not saved.
  return taskType === 'task1'
    ? base.extend({ chartType: task1MetaFields.chartType, imageAlt: z.string().trim().max(250) })
    : base;
}

export type Enrichment = z.infer<ReturnType<typeof enrichSchema>> & { chartType?: ChartType; imageAlt?: string };

/** One line per problem, for the needs_manual record and the logs. */
export function zodProblems(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || 'reply'}: ${i.message}`);
}

/**
 * The same shapes as JSON Schema, for the API's structured outputs. That only
 * guarantees the JSON parses and has these fields and enums; counts and
 * lengths are not something it can enforce, so zod checks those after.
 */
export function replyJsonSchema(kind: 'draft' | 'enrich', taskType: SampleTaskType): Record<string, unknown> {
  const str = { type: 'string' };
  const strings = { type: 'array', items: str };
  const obj = (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });
  const meta = {
    title: str,
    topic: { type: 'string', enum: [...TOPICS] },
    ...(taskType === 'task1' ? { chartType: { type: 'string', enum: [...CHART_TYPES] }, imageAlt: str } : {}),
  };
  if (kind === 'enrich') return obj({ outline: strings, grammarHighlights: strings, ...meta });
  return obj({
    sampleAnswer: str,
    band: { type: 'number' },
    wordCount: { type: 'integer' },
    outline: strings,
    vocabulary: { type: 'array', items: obj({ word: str, meaning: str, uz: str, example: str }) },
    grammarHighlights: strings,
    ...meta,
  });
}
