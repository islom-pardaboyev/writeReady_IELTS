import Anthropic from '@anthropic-ai/sdk';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { essayKeys } from '../savedReports.js';
import { bandDescriptors } from '../../feedback.js';
import {
  BANK, BANK_SOURCE_CREDIT, CHARTS, QUESTION_META, QUEUE, RUNS, SAMPLES,
  countWords, draftSchema, enrichSchema, imageUrlFor, replyJsonSchema, zodProblems,
  type Draft, type Enrichment, type SampleTaskType,
} from './model.js';
import { assignSlug, baseSlug } from './slug.js';
import { sendForReview } from './review.js';

/**
 * The daily AI work, through the Message Batches API (half price, results
 * within 24 hours, usually within one):
 *
 *   'draft'   a Band 8 model answer for a bank question that has no sample
 *             yet, plus the question's title, topic, chart type and alt text.
 *   'enrich'  for a student's shared essay: the question's metadata if it has
 *             none, and an outline and grammar notes of the essay as written.
 *
 * One run collects the batch the previous run sent, then sends a new one
 * (api/_lib/routes/samplesCron.ts). Every reply is checked with zod
 * (./model.ts); a draft that fails is kept as 'needs_manual' and never
 * published. Each batch's token use and estimated cost is kept in
 * generationRuns.
 */

export const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 4000;
const MAX_ENRICH_PER_RUN = 20;

/** USD per million tokens at Batch prices (half the standard rate). */
const BATCH_PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-haiku-4-5': { input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
};

export function model(): string {
  return (process.env.SAMPLES_MODEL ?? '').trim() || DEFAULT_MODEL;
}

export function perRunLimit(): number {
  const n = Number(process.env.SAMPLES_PER_RUN);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 10;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export function costUSD(usage: TokenUsage, modelId = model()): number {
  const p = BATCH_PRICES[modelId] ?? BATCH_PRICES[DEFAULT_MODEL];
  const usd = (usage.input * p.input + usage.output * p.output + usage.cacheWrite * p.cacheWrite + usage.cacheRead * p.cacheRead) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

// ── The prompt ───────────────────────────────────────────────────────────────

/**
 * The same for every request, both kinds and both tasks, so it is one cached
 * prefix. (Haiku 4.5 caches a prefix of 4,096 tokens or more; shorter ones
 * simply run uncached, at the normal price.)
 */
export function sharedInstructions(): string {
  return `You are an experienced IELTS examiner and writing teacher. You write model answers and study notes for IELTS Academic Writing questions for WriteReady, a site for IELTS students in Uzbekistan. Each request says which of two kinds it is.

=== KIND A: MODEL ANSWER ===
Write a model answer for the IELTS Academic Writing task in the request.
Rules:
- Target Band 8. Follow the official band descriptors below.
- Sound natural, like a strong real candidate. Avoid rare, over-academic words used only to impress, and avoid memorised-sounding phrases.
- Task 2: 260-300 words, clear position, 4-5 paragraphs.
- Task 1: 160-190 words: an introduction that paraphrases the question, a clear overview of the main trends/features, and accurate key figures with comparisons. Do not give opinions. The chart/graph/map/process diagram is attached as an image. Read all numbers, labels, and units directly from the image. Never guess or invent data.
- sampleAnswer: the answer only, paragraphs separated by a blank line ("\\n\\n"). No title, no word count.
- outline: the plan of your answer, one short line per paragraph.
- vocabulary: 8-12 topic-specific words or collocations that appear in your answer (for Task 1, include language for describing trends/comparisons). For each: "word"; "meaning", a simple English meaning; "uz", an accurate natural Uzbek translation (Latin script); "example", a new example sentence (not copied from the essay).
- grammarHighlights: 3-4 structures used in the answer and why they help the band score, one sentence each, quoting your own words.
- band: the band your answer deserves under the descriptors. wordCount: the number of words in sampleAnswer.

=== KIND B: STUDY NOTES FOR A STUDENT'S ESSAY ===
A student's essay that was marked Band 7 or higher will be shown to other students as a sample answer. Never change, correct or rewrite it.
- outline: the plan of the essay as written, one short line per paragraph.
- grammarHighlights: 3-4 structures the essay uses well and why they help the band score, one sentence each, quoting the student's words. Never point out mistakes.

=== BOTH KINDS: ABOUT THE QUESTION ===
- title: 2-5 words in sentence case naming what the question is about, used as the page heading and address. Task 2 example: "Children and technology". Task 1: the subject of the data, without the chart type, e.g. "Energy consumption in the USA".
- topic: the closest topic from the allowed list.
- Task 1 only. chartType: the kind of visual ("Mixed charts" when there is more than one kind). imageAlt: one sentence under 200 characters describing the visual for someone who cannot see it, e.g. "Line graph showing energy consumption in the USA from 1980 to 2030". If no visual is attached, imageAlt is an empty string.

=== OFFICIAL BAND DESCRIPTORS: TASK 1 ===
${bandDescriptors('Task 1')}

=== OFFICIAL BAND DESCRIPTORS: TASK 2 ===
${bandDescriptors('Task 2')}

Return ONLY valid JSON in the shape the request asks for.`;
}

const label = (t: SampleTaskType) => (t === 'task1' ? 'Task 1' : 'Task 2');

/** The question (and essay) as the model reads it. Student text goes inside tags so it cannot pass for instructions. */
export function requestText(kind: 'draft' | 'enrich', taskType: SampleTaskType, question: string, opts: { essay?: string; band?: number; chart: boolean }): string {
  const lines = [
    kind === 'draft' ? 'KIND A: MODEL ANSWER' : "KIND B: STUDY NOTES FOR A STUDENT'S ESSAY",
    `Task: IELTS Academic Writing ${label(taskType)}`,
    '',
    'Question:',
    `<question>\n${question.trim()}\n</question>`,
  ];
  if (taskType === 'task1') {
    lines.push('', opts.chart
      ? 'The chart/graph/map/process diagram is attached as an image. Read all numbers, labels, and units directly from the image. Never guess or invent data.'
      : 'No visual is attached.');
  }
  if (kind === 'enrich') {
    lines.push('', `The student's essay (marked Band ${opts.band ?? 7}):`, `<essay>\n${(opts.essay ?? '').trim()}\n</essay>`);
  }
  return lines.join('\n');
}

type ChartBlock = Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam;

/** A stored chart (a data URL) as a block the model can read, or null. */
export function chartBlock(dataUrl: unknown): { block: ChartBlock; ext: 'jpg' | 'png' | 'pdf' } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl.trim());
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (type === 'application/pdf') {
    return { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m[2] } }, ext: 'pdf' };
  }
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png') {
    const media = type === 'image/png' ? 'image/png' : 'image/jpeg';
    return { block: { type: 'image', source: { type: 'base64', media_type: media, data: m[2] } }, ext: media === 'image/png' ? 'png' : 'jpg' };
  }
  return null;
}

export function buildRequest(
  customId: string,
  kind: 'draft' | 'enrich',
  taskType: SampleTaskType,
  question: string,
  opts: { essay?: string; band?: number; chart: ChartBlock | null },
): Anthropic.Messages.BatchCreateParams.Request {
  return {
    custom_id: customId,
    params: {
      model: model(),
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: sharedInstructions(), cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          ...(opts.chart ? [opts.chart] : []),
          { type: 'text', text: requestText(kind, taskType, question, { essay: opts.essay, band: opts.band, chart: !!opts.chart }) },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema: replyJsonSchema(kind, taskType) } },
    },
  };
}

// ── The Batches API, swappable for tests ─────────────────────────────────────

export interface BatchApi {
  create(requests: Anthropic.Messages.BatchCreateParams.Request[]): Promise<{ id: string }>;
  status(id: string): Promise<string>;
  results(id: string): AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>;
}

export function anthropicBatches(client: Anthropic): BatchApi {
  return {
    create: (requests) => client.messages.batches.create({ requests }),
    status: async (id) => (await client.messages.batches.retrieve(id)).processing_status,
    results: async function* (id) {
      for await (const r of await client.messages.batches.results(id)) yield r;
    },
  };
}

// ── What the bank and the samples hold ───────────────────────────────────────

interface BankQuestion {
  id: string;
  taskType: SampleTaskType;
  text: string;
  createdMs: number;
}

const millis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : 0;

async function loadBank(): Promise<BankQuestion[]> {
  const store = db();
  const out: BankQuestion[] = [];
  for (const taskType of ['task1', 'task2'] as const) {
    const snap = await store.collection(BANK[taskType]).select('report', 'createdAt').get();
    for (const d of snap.docs) {
      const text = d.get('report');
      if (typeof text === 'string' && text.trim()) out.push({ id: d.id, taskType, text, createdMs: millis(d.get('createdAt')) });
    }
  }
  return out;
}

/**
 * Keeps questionMeta.questionKey up to date for every bank question, so a
 * Relax essay whose question is word for word a bank question can be matched
 * to it (./consent.ts). Writes only what changed.
 */
export async function syncQuestionKeys(bank: BankQuestion[]): Promise<number> {
  const store = db();
  const snap = await store.collection(QUESTION_META).select('questionKey').get();
  const have = new Map(snap.docs.map((d) => [d.id, d.get('questionKey')]));
  let batch = store.batch();
  let pending = 0;
  let written = 0;
  for (const q of bank) {
    const { questionKey } = essayKeys(label(q.taskType), q.text, '');
    if (have.get(q.id) === questionKey) continue;
    batch.set(store.collection(QUESTION_META).doc(q.id), { taskType: q.taskType, questionKey }, { merge: true });
    written++;
    if (++pending === 400) {
      await batch.commit();
      batch = store.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();
  return written;
}

interface SampleRow {
  id: string;
  questionId: string;
  taskType: SampleTaskType;
  status: string;
  sourceType: string;
  slug: string;
  sampleAnswer: string;
  band: number;
  questionText: string;
  enrichedAt?: unknown;
  enrichAttempts: number;
}

async function loadSamples(): Promise<SampleRow[]> {
  const snap = await db().collection(SAMPLES)
    .select('questionId', 'taskType', 'status', 'sourceType', 'slug', 'sampleAnswer', 'band', 'questionText', 'enrichedAt', 'enrichAttempts')
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    questionId: String(d.get('questionId') ?? ''),
    taskType: d.get('taskType') === 'task1' ? 'task1' : 'task2',
    status: String(d.get('status') ?? ''),
    sourceType: String(d.get('sourceType') ?? ''),
    slug: String(d.get('slug') ?? ''),
    sampleAnswer: String(d.get('sampleAnswer') ?? ''),
    band: Number(d.get('band')) || 0,
    questionText: String(d.get('questionText') ?? ''),
    enrichedAt: d.get('enrichedAt'),
    enrichAttempts: Number(d.get('enrichAttempts')) || 0,
  }));
}

interface RunRequest {
  customId: string;
  kind: 'draft' | 'enrich';
  questionId: string;
  taskType: SampleTaskType;
  questionText: string;
  /** The student sample an 'enrich' request is for. */
  sampleId?: string;
  imageExt?: 'jpg' | 'png' | 'pdf';
  regenerate?: boolean;
}

async function inFlight(): Promise<{ questions: Set<string>; samples: Set<string> }> {
  const snap = await db().collection(RUNS).where('status', '==', 'submitted').get();
  const questions = new Set<string>();
  const samples = new Set<string>();
  for (const d of snap.docs) {
    for (const r of (d.get('requests') ?? []) as RunRequest[]) {
      if (r.kind === 'draft') questions.add(r.questionId);
      if (r.sampleId) samples.add(r.sampleId);
    }
  }
  return { questions, samples };
}

async function loadChart(questionId: string): Promise<ReturnType<typeof chartBlock>> {
  const snap = await db().collection(CHARTS).doc(questionId).get();
  return snap.exists ? chartBlock(snap.get('data')) : null;
}

// ── Sending a batch ──────────────────────────────────────────────────────────

export interface SubmitResult {
  runId: string | null;
  drafts: number;
  enrich: number;
  /** Task 1 questions with no usable chart, recorded as needs_manual instead. */
  noChart: number;
  keysUpdated: number;
}

/**
 * Picks the questions and student essays to work on and sends them as one
 * batch. Drafts: questions waiting for Regenerate first, then the newest
 * questions with no sample at all. A question is never picked twice: one
 * with a pending, published or needs_manual sample, one whose AI draft the
 * admin rejected (Reject means "no"; Regenerate is the way to ask again), and
 * one already in a batch are all skipped.
 */
export async function submitBatch(api: BatchApi, limit = perRunLimit()): Promise<SubmitResult> {
  const store = db();
  const bank = await loadBank();
  const keysUpdated = await syncQuestionKeys(bank);
  const [samples, flying, queueSnap] = await Promise.all([loadSamples(), inFlight(), store.collection(QUEUE).get()]);
  const byId = new Map(bank.map((q) => [q.id, q]));

  const blocked = new Set<string>();
  const aiRejected = new Set<string>();
  for (const s of samples) {
    if (s.status === 'pending' || s.status === 'published' || s.status === 'needs_manual') blocked.add(s.questionId);
    if (s.sourceType === 'ai' && s.status === 'rejected') aiRejected.add(s.questionId);
  }
  const queued = new Set(queueSnap.docs.filter((d) => d.get('kind') === 'regenerate').map((d) => d.id));

  const candidates = [
    ...[...queued].map((id) => byId.get(id)).filter((q): q is BankQuestion => !!q),
    ...bank
      .filter((q) => !queued.has(q.id) && !blocked.has(q.id) && !aiRejected.has(q.id))
      .sort((a, b) => b.createdMs - a.createdMs),
  ].filter((q) => !flying.questions.has(q.id));
  // A regenerate for a question that left the bank has nothing to do.
  for (const id of queued) if (!byId.has(id)) await store.collection(QUEUE).doc(id).delete();

  const requests: Anthropic.Messages.BatchCreateParams.Request[] = [];
  const records: RunRequest[] = [];
  let noChart = 0;
  for (const q of candidates) {
    if (records.filter((r) => r.kind === 'draft').length >= limit) break;
    let chart: ReturnType<typeof chartBlock> = null;
    if (q.taskType === 'task1') {
      chart = await loadChart(q.id).catch(() => null);
      if (!chart) {
        await recordNoChart(q);
        noChart++;
        continue;
      }
    }
    const customId = `draft-${records.length}`;
    requests.push(buildRequest(customId, 'draft', q.taskType, q.text, { chart: chart?.block ?? null }));
    records.push({
      customId, kind: 'draft', questionId: q.id, taskType: q.taskType, questionText: q.text,
      ...(chart ? { imageExt: chart.ext } : {}),
      ...(queued.has(q.id) ? { regenerate: true } : {}),
    });
  }

  const toEnrich = samples
    .filter((s) => s.sourceType === 'student' && (s.status === 'pending' || s.status === 'published'))
    .filter((s) => !s.enrichedAt && s.enrichAttempts < 3 && !flying.samples.has(s.id))
    .slice(0, MAX_ENRICH_PER_RUN);
  for (const s of toEnrich) {
    const chart = s.taskType === 'task1' ? await loadChart(s.questionId).catch(() => null) : null;
    const customId = `enrich-${records.length}`;
    requests.push(buildRequest(customId, 'enrich', s.taskType, s.questionText, { essay: s.sampleAnswer, band: s.band, chart: chart?.block ?? null }));
    records.push({
      customId, kind: 'enrich', questionId: s.questionId, taskType: s.taskType, questionText: s.questionText, sampleId: s.id,
      ...(chart ? { imageExt: chart.ext } : {}),
    });
  }

  const drafts = records.filter((r) => r.kind === 'draft').length;
  if (!requests.length) return { runId: null, drafts: 0, enrich: 0, noChart, keysUpdated };

  const batch = await api.create(requests);
  await store.collection(RUNS).doc(batch.id).set({
    batchId: batch.id,
    status: 'submitted',
    model: model(),
    requests: records,
    counts: { drafts, enrich: records.length - drafts },
    submittedAt: FieldValue.serverTimestamp(),
  });
  return { runId: batch.id, drafts, enrich: records.length - drafts, noChart, keysUpdated };
}

/** A Task 1 question that cannot be drafted: its chart is missing or unreadable. Recorded once, so it is not picked again every day. */
async function recordNoChart(q: BankQuestion): Promise<void> {
  const now = FieldValue.serverTimestamp();
  await db().collection(SAMPLES).add({
    questionId: q.id,
    slug: '',
    taskType: q.taskType,
    questionText: q.text,
    sourceType: 'ai',
    sampleAnswer: '',
    band: 0,
    criteria: null,
    wordCount: 0,
    outline: [],
    vocabulary: [],
    grammarHighlights: [],
    status: 'needs_manual',
    validationErrors: ['The question has no chart image, or it could not be loaded, so no answer was written.'],
    createdAt: now,
    updatedAt: now,
  });
}

// ── Collecting a batch ───────────────────────────────────────────────────────

export interface CollectResult {
  runs: number;
  drafts: number;
  needsManual: number;
  enriched: number;
  failed: number;
  costUSD: number;
}

const MAX_RUN_AGE_MS = 30 * 3600 * 1000;

/** Reads every finished batch, saves what came back, and sends the new drafts for review. */
export async function collectBatches(api: BatchApi): Promise<CollectResult> {
  const store = db();
  const total: CollectResult = { runs: 0, drafts: 0, needsManual: 0, enriched: 0, failed: 0, costUSD: 0 };
  const runs = await store.collection(RUNS).where('status', '==', 'submitted').get();
  for (const run of runs.docs) {
    const batchId = String(run.get('batchId'));
    let status: string;
    try {
      status = await api.status(batchId);
    } catch (e) {
      console.error(`samples: could not check batch ${batchId}:`, e);
      continue;
    }
    if (status !== 'ended') {
      // A batch ends within 24 hours by itself; one that never reports back
      // must not keep its questions out of every later run.
      if (Date.now() - millis(run.get('submittedAt')) > MAX_RUN_AGE_MS) {
        await run.ref.set({ status: 'abandoned', collectedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      continue;
    }

    const records = new Map(((run.get('requests') ?? []) as RunRequest[]).map((r) => [r.customId, r]));
    const usage: TokenUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const counts = { drafts: 0, needsManual: 0, enriched: 0, failed: 0 };
    const toReview: string[] = [];
    for await (const result of api.results(batchId)) {
      const record = records.get(result.custom_id);
      if (!record) continue;
      try {
        if (result.result.type === 'succeeded') {
          const message = result.result.message;
          usage.input += message.usage.input_tokens ?? 0;
          usage.output += message.usage.output_tokens ?? 0;
          usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
          usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
          const textOut = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
          if (record.kind === 'draft') {
            const saved = await saveDraft(record, textOut, message.stop_reason);
            if (saved.status === 'pending') {
              counts.drafts++;
              toReview.push(saved.id);
            } else counts.needsManual++;
          } else if (await saveEnrichment(record, textOut, message.stop_reason)) counts.enriched++;
          else counts.failed++;
        } else {
          // Errored, expired or cancelled. Server-side trouble is tried again
          // next run (nothing was saved, so the question is still free); a
          // request the API refused as invalid will not get better, so a draft
          // is kept as needs_manual.
          const invalid = result.result.type === 'errored' && result.result.error.error.type === 'invalid_request_error';
          if (record.kind === 'draft' && invalid) {
            await saveDraftFailure(record, [`The API refused the request: ${result.result.type === 'errored' ? result.result.error.error.message : ''}`], '');
            counts.needsManual++;
          } else if (record.kind === 'enrich') {
            await bumpEnrichAttempts(record.sampleId);
          }
          counts.failed++;
        }
      } catch (e) {
        console.error(`samples: could not save ${result.custom_id} of ${batchId}:`, e);
        counts.failed++;
      }
      if (record.regenerate && record.kind === 'draft') await store.collection(QUEUE).doc(record.questionId).delete().catch(() => {});
    }

    const cost = costUSD(usage, String(run.get('model') ?? model()));
    await run.ref.set({
      status: 'collected',
      usage,
      costUSD: cost,
      results: counts,
      collectedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    for (const id of toReview) {
      await sendForReview(id).catch((e) => console.error(`samples: could not send ${id} for review:`, e));
    }
    total.runs++;
    total.drafts += counts.drafts;
    total.needsManual += counts.needsManual;
    total.enriched += counts.enriched;
    total.failed += counts.failed;
    total.costUSD += cost;
  }
  total.costUSD = Math.round(total.costUSD * 1e6) / 1e6;
  return total;
}

function parseReply(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the reply had no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

/** Checks a draft reply. Exported for scripts/test-samples.ts. */
export function checkDraft(taskType: SampleTaskType, text: string, stopReason: string | null): { draft: Draft } | { problems: string[] } {
  if (stopReason === 'max_tokens') return { problems: ['the reply was cut off (max_tokens)'] };
  if (stopReason === 'refusal') return { problems: ['the model declined to answer'] };
  let parsed: unknown;
  try {
    parsed = parseReply(text);
  } catch (e) {
    return { problems: [`the reply was not valid JSON: ${(e as Error).message}`] };
  }
  const result = draftSchema(taskType).safeParse(parsed);
  return result.success ? { draft: result.data as Draft } : { problems: zodProblems(result.error) };
}

export function checkEnrichment(taskType: SampleTaskType, text: string, stopReason: string | null): { notes: Enrichment } | { problems: string[] } {
  if (stopReason === 'max_tokens' || stopReason === 'refusal') return { problems: [`stop_reason ${stopReason}`] };
  let parsed: unknown;
  try {
    parsed = parseReply(text);
  } catch (e) {
    return { problems: [`the reply was not valid JSON: ${(e as Error).message}`] };
  }
  const result = enrichSchema(taskType).safeParse(parsed);
  return result.success ? { notes: result.data as Enrichment } : { problems: zodProblems(result.error) };
}

/**
 * Records the question's metadata (keeping anything it already has: a slug
 * and a title never change once set) and gives the question's samples their
 * slug and chart address if they had none yet.
 */
export async function applyMeta(
  questionId: string,
  taskType: SampleTaskType,
  meta: { title: string; topic: string; chartType?: string; imageAlt?: string },
  imageExt?: 'jpg' | 'png' | 'pdf',
): Promise<{ slug: string; imageAlt: string; imageExt: 'jpg' | 'png' | 'pdf' }> {
  const store = db();
  const ref = store.collection(QUESTION_META).doc(questionId);
  const snap = await ref.get();
  const have = snap.exists ? snap.data() ?? {} : {};
  const keep = (field: string, value: string | undefined) =>
    typeof have[field] === 'string' && have[field] ? {} : value ? { [field]: value } : {};
  await ref.set({
    taskType,
    ...keep('title', meta.title),
    ...keep('topic', meta.topic),
    ...(taskType === 'task1' ? { ...keep('chartType', meta.chartType), ...keep('imageAlt', meta.imageAlt?.trim()) } : {}),
    ...(imageExt ? { imageExt } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const title = typeof have.title === 'string' && have.title ? have.title : meta.title;
  const chartType = typeof have.chartType === 'string' && have.chartType ? have.chartType : meta.chartType;
  const slug = await assignSlug(questionId, taskType, baseSlug(taskType, title, chartType));
  const imageAlt = (typeof have.imageAlt === 'string' && have.imageAlt) || meta.imageAlt?.trim() || '';
  const ext = imageExt ?? (have.imageExt === 'png' || have.imageExt === 'pdf' ? have.imageExt : 'jpg');

  // Samples saved before the question had a slug (a student's share) get it now.
  const siblings = await store.collection(SAMPLES).where('questionId', '==', questionId).get();
  for (const d of siblings.docs) {
    const patch: Record<string, unknown> = {};
    if (!d.get('slug')) patch.slug = slug;
    if (taskType === 'task1') {
      if (!d.get('imageUrl')) patch.imageUrl = imageUrlFor(slug, ext);
      if (!d.get('imageAlt') && imageAlt) patch.imageAlt = imageAlt;
    }
    if (Object.keys(patch).length) {
      if (d.get('status') === 'published') patch.pageChangedAt = FieldValue.serverTimestamp();
      await d.ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return { slug, imageAlt, imageExt: ext };
}

async function saveDraft(record: RunRequest, text: string, stopReason: string | null): Promise<{ id: string; status: 'pending' | 'needs_manual' }> {
  const checked = checkDraft(record.taskType, text, stopReason);
  if ('problems' in checked) {
    return { id: await saveDraftFailure(record, checked.problems, text), status: 'needs_manual' };
  }
  const d = checked.draft;
  const meta = await applyMeta(record.questionId, record.taskType, d, record.imageExt);
  const now = FieldValue.serverTimestamp();
  const ref = await db().collection(SAMPLES).add({
    questionId: record.questionId,
    slug: meta.slug,
    taskType: record.taskType,
    questionText: record.questionText,
    ...(record.taskType === 'task1' ? { imageUrl: imageUrlFor(meta.slug, meta.imageExt), imageAlt: meta.imageAlt } : {}),
    sourceType: 'ai',
    sampleAnswer: d.sampleAnswer.trim(),
    band: Math.round(d.band * 2) / 2,
    criteria: null,
    wordCount: countWords(d.sampleAnswer),
    outline: d.outline,
    vocabulary: d.vocabulary,
    grammarHighlights: d.grammarHighlights,
    status: 'pending',
    sourceCredit: BANK_SOURCE_CREDIT,
    generation: { model: model() },
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, status: 'pending' };
}

async function saveDraftFailure(record: RunRequest, problems: string[], raw: string): Promise<string> {
  console.error(`samples: draft for ${record.questionId} needs manual review: ${problems.join('; ')}`);
  const now = FieldValue.serverTimestamp();
  const ref = await db().collection(SAMPLES).add({
    questionId: record.questionId,
    slug: '',
    taskType: record.taskType,
    questionText: record.questionText,
    sourceType: 'ai',
    sampleAnswer: '',
    band: 0,
    criteria: null,
    wordCount: 0,
    outline: [],
    vocabulary: [],
    grammarHighlights: [],
    status: 'needs_manual',
    validationErrors: problems.slice(0, 20),
    rawReply: raw.slice(0, 20_000),
    generation: { model: model() },
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

async function bumpEnrichAttempts(sampleId: string | undefined): Promise<void> {
  if (!sampleId) return;
  await db().collection(SAMPLES).doc(sampleId).set({ enrichAttempts: FieldValue.increment(1) }, { merge: true });
}

async function saveEnrichment(record: RunRequest, text: string, stopReason: string | null): Promise<boolean> {
  const checked = checkEnrichment(record.taskType, text, stopReason);
  if ('problems' in checked) {
    console.error(`samples: notes for sample ${record.sampleId} failed: ${checked.problems.join('; ')}`);
    await bumpEnrichAttempts(record.sampleId);
    return false;
  }
  const n = checked.notes;
  await applyMeta(record.questionId, record.taskType, n, record.imageExt);
  const ref = db().collection(SAMPLES).doc(record.sampleId!);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.set({
    outline: n.outline,
    grammarHighlights: n.grammarHighlights,
    enrichedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.get('status') === 'published' ? { pageChangedAt: FieldValue.serverTimestamp() } : {}),
  }, { merge: true });
  return true;
}
