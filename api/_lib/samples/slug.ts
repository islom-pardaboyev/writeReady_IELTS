import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { QUESTION_META, SLUGS, type SampleTaskType } from './model.js';

/**
 * Every question's address: /questions/task2/children-and-technology.
 *
 * A slug is handed out once, the first time a question gets its metadata, and
 * never changes after that: a page that search engines and students have
 * linked to must keep its address even if the question is edited. slugs/{slug}
 * records who owns each one, so two questions can never share an address.
 */

const MAX_WORDS = 7;
const MAX_CHARS = 60;
/** Words that only make an address longer. "and" stays: "children-and-technology" reads better without a gap. */
const DROP = new Set(['a', 'an', 'the']);

/** "Energy Consumption in the USA (1980–2030)" -> "energy-consumption-in-usa-1980-2030". */
export function slugify(text: string, maxWords = MAX_WORDS): string {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !DROP.has(w))
    .slice(0, maxWords);
  let slug = '';
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > MAX_CHARS) break;
    slug = next;
  }
  return slug;
}

/**
 * The address a question asks for, before checking it is free. Task 1 leads
 * with its chart type ("line-graph-energy-consumption"), and a title that
 * already starts with the chart type does not say it twice.
 */
export function baseSlug(taskType: SampleTaskType, title: string, chartType?: string): string {
  if (taskType === 'task2' || !chartType) return slugify(title);
  const type = slugify(chartType);
  let rest = slugify(title, MAX_WORDS + 3);
  if (rest === type) rest = '';
  else if (rest.startsWith(`${type}-`)) rest = rest.slice(type.length + 1);
  // Also drops a leading "of"/"showing" left behind by "Line graph of ...".
  rest = rest.replace(/^(of|showing|on|about)-/, '');
  return slugify(`${type} ${rest.split('-').join(' ')}`);
}

/** base, base-2, base-3, ... */
export function slugCandidates(base: string, count = 25): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base}-${i + 1}`));
}

/**
 * The question's slug: the one it already has, or the first free candidate,
 * claimed for it in one transaction. Safe to call again and again.
 */
export async function assignSlug(questionId: string, taskType: SampleTaskType, base: string): Promise<string> {
  const store = db();
  const metaRef = store.collection(QUESTION_META).doc(questionId);
  const fallback = `question-${questionId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'x'}`;
  const candidates = slugCandidates(base || fallback);
  return store.runTransaction(async (tx) => {
    const meta = await tx.get(metaRef);
    const existing = meta.exists ? meta.get('slug') : undefined;
    if (typeof existing === 'string' && existing) return existing;
    const refs = candidates.map((s) => store.collection(SLUGS).doc(s));
    const snaps = await tx.getAll(...refs);
    const free = snaps.findIndex((s) => !s.exists || s.get('questionId') === questionId);
    if (free < 0) throw new Error(`no free slug for ${questionId} (tried ${candidates[0]}...)`);
    const slug = candidates[free];
    tx.set(refs[free], { questionId, taskType, createdAt: FieldValue.serverTimestamp() });
    tx.set(metaRef, { slug, taskType, slugAt: FieldValue.serverTimestamp() }, { merge: true });
    return slug;
  });
}
