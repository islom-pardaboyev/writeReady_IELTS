import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './db.js';
import { CRITERIA, normalizeScores, type BandScores } from './bandScore.js';
import { seal, sign, unseal, verifySignature } from './seal.js';

/**
 * Same essay, same score.
 *
 * Three stores, each with one job:
 *
 *   saved_reports/{uid}_{contentKey}   a student's own report, sealed. Opening
 *                                      it again is free, on any device.
 *   score_locks/{contentKey}           the bands the first marking of an exact
 *                                      text gave, signed. Anyone who submits
 *                                      that text later gets the same bands.
 *   feedback_reports/{id}              the history entry (existing), now
 *                                      signed so a verification can trust it.
 *
 * A text that is nearly the same as one the student had marked before (a few
 * words changed) is marked with the earlier bands as an anchor, so a band
 * only moves when the changes earn it. See findSimilarReport.
 *
 * All three are written only by api/ with the Admin SDK. They are sealed or
 * signed so they stay private and honest whatever the Firestore rules say.
 */

export type TaskType = 'Task 1' | 'Task 2';
export type Tier = 'full' | 'limited';

/**
 * Score locks made under another version are ignored, so a new submission of
 * an old text is marked afresh. Change this ONLY when the scoring prompt in
 * api/feedback.ts changes on purpose and old bands should stop applying.
 * Saved reports are not affected: a student's own report always reopens.
 */
export const SCORING_VERSION = '2026-09-24';

/** Real IELTS answers are 150-400 words; these stop a book going through a paid model. */
export const LIMITS = { essayWords: 1000, essayChars: 10_000, questionChars: 3_000 } as const;

const SAVED = 'saved_reports';
const LOCKS = 'score_locks';

// ── Identity of a text ───────────────────────────────────────────────────────

/**
 * The text as it counts for "same essay": Unicode-normalised, curly quotes
 * made straight, and every run of spaces or line breaks made one space. Case
 * and punctuation are kept, because they are part of what is marked.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export interface EssayKeys {
  /** The exact essay, for this question and task. */
  contentKey: string;
  /** The question alone, to find other versions of an essay. */
  questionKey: string;
}

export function essayKeys(taskType: TaskType, question: string, essay: string): EssayKeys {
  const q = normalizeText(question);
  return {
    contentKey: sha256(`${taskType}\n${q}\n${normalizeText(essay)}`),
    questionKey: sha256(`${taskType}\n${q}`).slice(0, 32),
  };
}

// ── Near-duplicates (MinHash) ────────────────────────────────────────────────
//
// A signature is 128 numbers summarising the essay's three-word phrases. The
// share of positions two signatures agree on estimates how much of their
// phrasing the two essays share (Jaccard similarity), without keeping either
// text readable. Signatures are stored, so the constants below must never
// change; bump SIGNATURE_VERSION instead if they ever have to.

export const SIGNATURE_VERSION = 1;
const SIGNATURE_SIZE = 128;
/** Share of three-word phrases two versions must share to count as "nearly the same". */
export const NEAR_DUPLICATE = 0.8;
/** Below this many words there is too little text to compare fairly. */
const MIN_WORDS = 40;

function mix32(x: number): number {
  let h = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SEEDS = Array.from({ length: SIGNATURE_SIZE }, (_, i) => mix32(Math.imul(i + 1, 0x9e3779b1)));

export function essaySignature(essay: string): number[] | null {
  const words = normalizeText(essay).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length < MIN_WORDS) return null;
  const phrases = new Set<number>();
  for (let i = 0; i + 3 <= words.length; i++) phrases.add(fnv1a(`${words[i]} ${words[i + 1]} ${words[i + 2]}`));
  const signature = new Array<number>(SIGNATURE_SIZE).fill(0xffffffff);
  for (const phrase of phrases) {
    for (let k = 0; k < SIGNATURE_SIZE; k++) {
      const v = mix32(phrase ^ SEEDS[k]);
      if (v < signature[k]) signature[k] = v;
    }
  }
  return signature;
}

export function signatureSimilarity(a: number[], b: number[]): number {
  if (a.length !== SIGNATURE_SIZE || b.length !== SIGNATURE_SIZE) return 0;
  let same = 0;
  for (let k = 0; k < SIGNATURE_SIZE; k++) if (a[k] === b[k]) same++;
  return same / SIGNATURE_SIZE;
}

// ── Saved reports ────────────────────────────────────────────────────────────

export interface SavedReport {
  tier: Tier;
  /** The report JSON exactly as the student received it. */
  raw: string;
  scores: BandScores;
  topic: string;
  /** The feedback_reports document this report is in the history as. */
  reportId: string;
  signature: number[] | null;
  signatureVersion: number;
}

const savedId = (uid: string, contentKey: string) => `${uid}_${contentKey}`;

function openSaved(sealed: unknown, id: string): SavedReport | null {
  const r = unseal<SavedReport>(sealed, id);
  if (!r || (r.tier !== 'full' && r.tier !== 'limited') || typeof r.raw !== 'string' || typeof r.reportId !== 'string') {
    return null;
  }
  const scores = normalizeScores(r.scores);
  if (!scores) return null;
  return { ...r, scores, topic: typeof r.topic === 'string' ? r.topic : 'General' };
}

export async function loadSavedReport(uid: string, contentKey: string): Promise<SavedReport | null> {
  const id = savedId(uid, contentKey);
  const snap = await db().collection(SAVED).doc(id).get();
  return snap.exists ? openSaved(snap.get('sealed'), id) : null;
}

/** Saves or replaces the student's report for this exact essay. */
export async function saveSavedReport(uid: string, keys: EssayKeys, taskType: TaskType, report: SavedReport): Promise<void> {
  const id = savedId(uid, keys.contentKey);
  const ref = db().collection(SAVED).doc(id);
  const existed = (await ref.get()).exists;
  await ref.set({
    // Plain fields exist only so the server can query; the sealed copy is
    // the truth, and a record whose plain fields were edited is still read
    // from the seal.
    uid,
    questionKey: keys.questionKey,
    taskType,
    sealed: seal(report, id),
    updatedAt: FieldValue.serverTimestamp(),
    ...(existed ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
}

/**
 * The closest earlier version of this essay the student had marked for the
 * same question, when it is nearly the same text. Null when there is none.
 */
export async function findSimilarReport(
  uid: string, keys: EssayKeys, signature: number[] | null,
): Promise<{ scores: BandScores; similarity: number } | null> {
  if (!signature) return null;
  const snap = await db().collection(SAVED)
    .where('uid', '==', uid)
    .where('questionKey', '==', keys.questionKey)
    .limit(30)
    .get();
  let best: { scores: BandScores; similarity: number } | null = null;
  for (const doc of snap.docs) {
    if (doc.id === savedId(uid, keys.contentKey)) continue;
    const r = openSaved(doc.get('sealed'), doc.id);
    if (!r?.signature || r.signatureVersion !== SIGNATURE_VERSION) continue;
    const similarity = signatureSimilarity(signature, r.signature);
    if (similarity >= NEAR_DUPLICATE && (!best || similarity > best.similarity)) best = { scores: r.scores, similarity };
  }
  return best;
}

// ── Score locks ──────────────────────────────────────────────────────────────

export interface ScoreLock {
  scores: BandScores;
  topic: string;
}

const bandsText = (scores: Record<string, number>) => CRITERIA.map((k) => scores[k]).join(',');
const lockPayload = (contentKey: string, version: string, scores: BandScores, topic: string) =>
  [contentKey, version, bandsText(scores), topic].join('|');

export async function loadScoreLock(contentKey: string): Promise<ScoreLock | null> {
  const snap = await db().collection(LOCKS).doc(contentKey).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  if (data.version !== SCORING_VERSION) return null;
  const scores = normalizeScores(data.scores);
  const topic = typeof data.topic === 'string' ? data.topic : 'General';
  if (!scores || !verifySignature('score-lock', lockPayload(contentKey, SCORING_VERSION, scores, topic), data.sig)) {
    return null;
  }
  return { scores, topic };
}

export async function saveScoreLock(contentKey: string, taskType: TaskType, lock: ScoreLock): Promise<void> {
  await db().collection(LOCKS).doc(contentKey).set({
    taskType,
    version: SCORING_VERSION,
    scores: lock.scores,
    topic: lock.topic,
    sig: sign('score-lock', lockPayload(contentKey, SCORING_VERSION, lock.scores, lock.topic)),
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ── History entries ──────────────────────────────────────────────────────────

/**
 * Signs a feedback_reports entry. Only the server can make this signature,
 * so a verification built on a signed entry is built on a real marking.
 */
export function reportSignature(id: string, uid: string, taskType: string, scores: Record<string, number>): string {
  return sign('report-sig', [id, uid, taskType, bandsText(scores)].join('|'));
}

export function reportSignatureValid(id: string, data: Record<string, unknown>): boolean {
  const scores = normalizeScores(data.scores);
  if (!scores || typeof data.uid !== 'string' || typeof data.taskType !== 'string') return false;
  return verifySignature('report-sig', [id, data.uid, data.taskType, bandsText(scores)].join('|'), data.sig);
}
