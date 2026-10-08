import Anthropic from '@anthropic-ai/sdk';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { bandDescriptors } from '../../feedback.js';
import {
  QUESTION_META, SAMPLES,
  enrichSchema, imageUrlFor, replyJsonSchema, zodProblems,
  type Enrichment, type SampleTaskType,
} from './model.js';
import { assignSlug, baseSlug } from './slug.js';
import { loadChartDataUrl } from './questions.js';

/**
 * What an approved sample needs before it can have a public page: its
 * question's title, topic, chart type and alt text, and for a student's essay
 * an outline and grammar notes of the essay as written. One Claude Haiku call
 * when the admin taps Approve (api/_lib/routes/telegram.ts). Every reply is
 * checked with zod (./model.ts).
 */

export const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 4000;

export function model(): string {
  return (process.env.SAMPLES_MODEL ?? '').trim() || DEFAULT_MODEL;
}

// ── The prompt ───────────────────────────────────────────────────────────────

export function sharedInstructions(): string {
  return `You are an experienced IELTS examiner and writing teacher. You write study notes for sample answers to IELTS Academic Writing questions for WriteReady, a site for IELTS students in Uzbekistan.

=== STUDY NOTES FOR A STUDENT'S ESSAY ===
A student's essay that was marked Band 7 or higher will be shown to other students as a sample answer. Never change, correct or rewrite it.
- outline: the plan of the essay as written, one short line per paragraph.
- grammarHighlights: 3-4 structures the essay uses well and why they help the band score, one sentence each, quoting the student's words. Never point out mistakes.

=== ABOUT THE QUESTION ===
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

/** The question and essay as the model reads them. Student text goes inside tags so it cannot pass for instructions. */
export function requestText(taskType: SampleTaskType, question: string, opts: { essay?: string; band?: number; chart: boolean }): string {
  const lines = [
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
  lines.push('', `The student's essay (marked Band ${opts.band ?? 7}):`, `<essay>\n${(opts.essay ?? '').trim()}\n</essay>`);
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
  taskType: SampleTaskType,
  question: string,
  opts: { essay?: string; band?: number; chart: ChartBlock | null },
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: model(),
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: sharedInstructions() }],
    messages: [{
      role: 'user',
      content: [
        ...(opts.chart ? [opts.chart] : []),
        { type: 'text', text: requestText(taskType, question, { essay: opts.essay, band: opts.band, chart: !!opts.chart }) },
      ],
    }],
    output_config: { format: { type: 'json_schema', schema: replyJsonSchema(taskType) } },
  };
}

async function loadChart(questionId: string): Promise<ReturnType<typeof chartBlock>> {
  return chartBlock(await loadChartDataUrl(questionId));
}

// ── Checking a reply ─────────────────────────────────────────────────────────

function parseReply(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the reply had no JSON object');
  return JSON.parse(text.slice(start, end + 1));
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
  // Typed from the schema, not written out: Vercel type-checks api/ without
  // strict mode, where every field zod infers is optional, and a hand-written
  // `title: string` then rejected an Enrichment.
  meta: Pick<Enrichment, 'title' | 'topic'> & { chartType?: string; imageAlt?: string },
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

/** The question's metadata, and the essay's outline and grammar notes, saved on the sample. */
async function storeNotes(
  sampleId: string, questionId: string, taskType: SampleTaskType, n: Enrichment, imageExt?: 'jpg' | 'png' | 'pdf',
): Promise<boolean> {
  await applyMeta(questionId, taskType, n, imageExt);
  const ref = db().collection(SAMPLES).doc(sampleId);
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

// ── Right after Approve ──────────────────────────────────────────────────────

const CHART_WORDS = /^(?:the\s+)?(?:(?:line|bar|pie)\s+(?:graph|chart)s?|graphs?|charts?|tables?|maps?|diagrams?|process(?:\s+diagram)?|plans?)\b/i;

/**
 * A title made from the question itself, for when the AI cannot give one:
 * "The bar chart below shows the number of cars per 1000 people in five
 * countries" -> "Number of cars per 1000 people in five countries".
 */
export function fallbackTitle(question: string): string {
  let text = question.replace(/\s+/g, ' ').trim().split(/(?<=[.?!])\s/)[0] ?? '';
  text = text
    .replace(CHART_WORDS, '')
    .replace(/^\s*(?:and\s+(?:the\s+)?\w+\s+)?(?:below|above)?\s*/i, '')
    .replace(/^(?:shows?|illustrates?|compares?|gives?|presents?|describes?|provides?|depicts?)\s+(?:information\s+(?:about|on)\s+)?/i, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/[.?!]+$/, '')
    // "... from 1980 to 2030", "... in 2005": the years belong in the text, not the title.
    .replace(/\s+(?:from|between|in|during|over|since)\s+(?:the\s+)?\d{4}\b.*$/i, '');
  const words = text.split(' ').filter(Boolean).slice(0, 9);
  while (words.length > 1 && /^(?:in|of|the|a|an|and|or|from|to|between|for|per|with|by|on|at)$/i.test(words[words.length - 1])) words.pop();
  const title = words.join(' ');
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : 'IELTS Writing question';
}

/**
 * Gives an approved sample's question its title, topic and page address
 * straight away, with one Claude Haiku call, so the next build can show it.
 * A student's essay also gets its outline and grammar notes. If the AI cannot
 * help, the question still gets an address made from its own words (topic
 * "Other") and the page goes up without notes.
 */
export async function prepareForPage(sampleId: string, client: Pick<Anthropic, 'messages'> | null): Promise<'had-slug' | 'ai' | 'fallback' | 'missing'> {
  const ref = db().collection(SAMPLES).doc(sampleId);
  const snap = await ref.get();
  if (!snap.exists) return 'missing';
  const s = snap.data() as { slug?: string; questionId: string; taskType: SampleTaskType; questionText: string; sampleAnswer: string; band: number; enrichedAt?: unknown; sourceType: string };
  if (s.slug) return 'had-slug';

  const chart = s.taskType === 'task1' ? await loadChart(s.questionId).catch(() => null) : null;
  if (client) {
    try {
      const params = buildRequest(s.taskType, s.questionText, { essay: s.sampleAnswer, band: s.band, chart: chart?.block ?? null });
      const message = await client.messages.create(params, { timeout: 40_000, maxRetries: 1 });
      const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const checked = checkEnrichment(s.taskType, text, message.stop_reason);
      if ('notes' in checked) {
        if (s.sourceType === 'student' && !s.enrichedAt) await storeNotes(sampleId, s.questionId, s.taskType, checked.notes, chart?.ext);
        else await applyMeta(s.questionId, s.taskType, checked.notes, chart?.ext);
        return 'ai';
      }
      console.error(`samples: notes for approved sample ${sampleId} failed: ${checked.problems.join('; ')}`);
    } catch (e) {
      console.error(`samples: could not prepare approved sample ${sampleId}:`, e);
    }
  }
  await applyMeta(s.questionId, s.taskType, { title: fallbackTitle(s.questionText), topic: 'Other' }, chart?.ext);
  return 'fallback';
}
