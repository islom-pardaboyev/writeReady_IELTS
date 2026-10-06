import { createHash, randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { currentDayKey } from '../shared.js';
import { extractJson, type BandScores } from '../bandScore.js';
import { essayKeys, loadSavedReport, normalizeText, LIMITS, type SavedReport, type TaskType } from '../savedReports.js';
import {
  BANK, BANK_SOURCE_CREDIT, CONSENTS, CONSENT_LIMITS, CREDITS, CUSTOM_QUESTIONS, MAX_CUSTOM_CHART_CHARS, QUESTION_META, SAMPLES, SUBMISSIONS,
  chartExt, countWords, imageUrlFor, type Criteria, type SampleMode, type SampleTaskType, type SampleVocab,
} from './model.js';
import { DAILY_CONSENT_LIMIT, MIN_BAND, qualifyingTasks, readMode } from './qualify.js';
import { stripPersonalDetails } from './pii.js';
import { findCustomQuestion, questionKeyOf, readUploadedChart } from './questions.js';

/**
 * "🎉 Band 7+! Can we show your essay anonymously as a sample answer?"
 *
 * The feedback page asks the server which of the session's essays may be
 * offered (consentStatus), and sends the student's answer (submitConsent).
 * Everything that matters is decided here, from records only the server can
 * write: the band comes from the student's saved report on that exact essay,
 * the question from the bank itself. The browser only says which essays it
 * has on screen.
 *
 * In Relax the student types the question. One that is word for word a bank
 * question counts as that bank question. Any other becomes a custom question
 * (customQuestions), shared together with the essay, and, for Task 1, the
 * chart the student uploaded: the admin approves all of it at once.
 *
 * Sharing gives one free assessment per consent action, however many tasks
 * the action shares: a Mock with two Band 7 tasks still gives +1. The credit
 * is written in the same transaction as the consent, under a key made from
 * the student and every essay in the session, so sending the same answer
 * twice (a double tap, a retry, a second tab) can never pay out twice.
 */

export class ConsentError extends Error {
  constructor(
    public code: 'BAD_REQUEST' | 'NOTHING_TO_SHARE' | 'ALREADY_DECIDED' | 'DAILY_LIMIT' | 'NO_PROFILE',
    message: string,
  ) {
    super(message);
  }
}

export interface SessionTask {
  taskType: SampleTaskType;
  /** The bank question the writing page says this is. Checked, never trusted. */
  questionId: string | null;
  question: string;
  essay: string;
  /** Relax Task 1: the chart the student uploaded, sent with the answer (not with the status check). */
  chart: string | null;
  /** Relax Task 1: whether the page holds a chart, for the status check. */
  hasChart: boolean;
}

export interface Session {
  mode: SampleMode;
  /** Every task the feedback page holds, shared or not. */
  tasks: SessionTask[];
}

const ID = /^[\w-]{1,128}$/;
const LABEL: Record<SampleTaskType, TaskType> = { task1: 'Task 1', task2: 'Task 2' };

/** The request body as a session, or a ConsentError. */
export function readSession(body: unknown): Session {
  const b = (body ?? {}) as Record<string, unknown>;
  const mode = readMode(b.mode);
  if (!mode) throw new ConsentError('BAD_REQUEST', 'Unknown writing mode.');
  if (!Array.isArray(b.tasks) || b.tasks.length === 0 || b.tasks.length > 2) {
    throw new ConsentError('BAD_REQUEST', 'No essays to check.');
  }
  const tasks = b.tasks.map((raw): SessionTask => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const taskType = t.taskType === 'Task 1' || t.taskType === 'task1' ? 'task1'
      : t.taskType === 'Task 2' || t.taskType === 'task2' ? 'task2' : null;
    if (!taskType) throw new ConsentError('BAD_REQUEST', 'Unknown task.');
    const question = typeof t.question === 'string' ? t.question : '';
    const essay = typeof t.essay === 'string' ? t.essay : '';
    if (!question.trim() || !essay.trim() || question.length > LIMITS.questionChars || essay.length > LIMITS.essayChars) {
      throw new ConsentError('BAD_REQUEST', 'The essay or question is missing.');
    }
    const questionId = typeof t.questionId === 'string' && ID.test(t.questionId) ? t.questionId : null;
    const chart = taskType === 'task1' ? readUploadedChart(t.chart, MAX_CUSTOM_CHART_CHARS) : null;
    return { taskType, questionId, question, essay, chart, hasChart: !!chart || (taskType === 'task1' && t.hasChart === true) };
  });
  return { mode, tasks };
}

export function readShare(raw: unknown): SampleTaskType[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((t) => (t === 'Task 1' ? 'task1' : t === 'Task 2' ? 'task2' : t)))]
    .filter((t): t is SampleTaskType => t === 'task1' || t === 'task2');
}

// ── Checking a task ──────────────────────────────────────────────────────────

interface QuestionRef {
  /** Empty for a custom question not shared before: it gets its id when the essay is shared. */
  id: string;
  /** The wording the sample shows: the bank's own, or the student's. */
  text: string;
  slug: string;
  imageAlt: string;
  imageExt: 'jpg' | 'png' | 'pdf';
  source: 'bank' | 'custom';
}

type BankQuestion = QuestionRef;

interface CheckedTask extends SessionTask {
  contentKey: string;
  band: number | null;
  saved: SavedReport | null;
  ref: QuestionRef | null;
  /** For qualifyingTasks: the bank question this essay answers, as the server sees it. */
  questionId: string | null;
  /** For qualifyingTasks: a Relax essay on the student's own question. */
  custom: boolean;
}

/** Slug, alt text and chart type the question already has, if any. */
async function metaOf(id: string): Promise<Pick<QuestionRef, 'slug' | 'imageAlt' | 'imageExt'>> {
  const meta = await db().collection(QUESTION_META).doc(id).get();
  const m = meta.exists ? meta.data() ?? {} : {};
  return {
    slug: typeof m.slug === 'string' ? m.slug : '',
    imageAlt: typeof m.imageAlt === 'string' ? m.imageAlt : '',
    imageExt: m.imageExt === 'png' || m.imageExt === 'pdf' ? m.imageExt : 'jpg',
  };
}

/**
 * The bank question this essay answers. The writing page's question id is
 * accepted only when the bank still holds that question with the same text;
 * otherwise (Relax, where the student types the question) the text has to
 * match a bank question word for word, found through its questionKey
 * (./generate.ts keeps questionMeta.questionKey for every bank question), or
 * by the bank's exact text.
 */
async function findBankQuestion(taskType: SampleTaskType, claimedId: string | null, question: string): Promise<BankQuestion | null> {
  const store = db();
  const wanted = normalizeText(question);
  const fromBank = async (id: string): Promise<BankQuestion | null> => {
    const [snap, meta] = await Promise.all([store.collection(BANK[taskType]).doc(id).get(), metaOf(id)]);
    const text = snap.exists ? snap.get('report') : undefined;
    if (typeof text !== 'string' || normalizeText(text) !== wanted) return null;
    return { id, text, ...meta, source: 'bank' };
  };

  if (claimedId) {
    const found = await fromBank(claimedId);
    if (found) return found;
  }
  const { questionKey } = essayKeys(LABEL[taskType], question, '');
  const match = await store.collection(QUESTION_META).where('questionKey', '==', questionKey).limit(3).get();
  for (const doc of match.docs) {
    if (doc.get('taskType') !== taskType) continue;
    const found = await fromBank(doc.id);
    if (found) return found;
  }
  // The questionKey index is built by the morning job; until it has run (or
  // for a question added since), a question pasted exactly as the bank holds
  // it is still found.
  for (const text of new Set([question, question.trim()])) {
    const exact = await store.collection(BANK[taskType]).where('report', '==', text).limit(1).get();
    if (!exact.empty) {
      const found = await fromBank(exact.docs[0].id);
      if (found) return found;
    }
  }
  return null;
}

async function checkTask(uid: string, t: SessionTask, mode: SampleMode): Promise<CheckedTask> {
  const { contentKey } = essayKeys(LABEL[t.taskType], t.question, t.essay);
  const saved = await loadSavedReport(uid, contentKey);
  const band = saved ? saved.scores.overall : null;
  // Below Band 7 there is nothing to offer, so the bank is not even asked.
  const strong = band !== null && band >= MIN_BAND;
  const bank = strong ? await findBankQuestion(t.taskType, t.questionId, t.question) : null;
  if (bank) return { ...t, contentKey, band, saved, ref: bank, questionId: bank.id, custom: false };

  // Relax, on the student's own question: a Task 1 needs its chart, or its
  // page would have nothing to describe.
  if (strong && mode === 'relax' && (t.taskType === 'task2' || t.hasChart)) {
    const known = await findCustomQuestion(t.taskType, t.question);
    const ref: QuestionRef = known
      ? { id: known.id, text: known.text, ...(await metaOf(known.id)), source: 'custom' }
      : { id: '', text: t.question.trim(), slug: '', imageAlt: '', imageExt: (t.chart && chartExt(t.chart)) || 'jpg', source: 'custom' };
    return { ...t, contentKey, band, saved, ref, questionId: null, custom: true };
  }
  return { ...t, contentKey, band, saved, ref: null, questionId: null, custom: false };
}

const consentRef = (uid: string, contentKey: string) => db().collection(CONSENTS).doc(`${uid}_${contentKey}`);

/** One key for the whole session: the student and every essay in it. */
export function sessionKey(uid: string, contentKeys: string[]): string {
  return createHash('sha256').update(`${uid}\n${[...contentKeys].sort().join('\n')}`).digest('hex');
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface OfferedTask {
  taskType: SampleTaskType;
  band: number;
}

export interface Status {
  /** The session's tasks the student may be asked about now: qualifying, and never answered. */
  offer: OfferedTask[];
  /**
   * Whether sharing would still earn the free assessment. False when another
   * task of the same session already earned it (the second task of a Mock
   * marked later), so the card does not promise it twice.
   */
  credit: boolean;
}

export async function consentStatus(uid: string, session: Session): Promise<Status> {
  const checked = await Promise.all(session.tasks.map((t) => checkTask(uid, t, session.mode)));
  const qualifying = qualifyingTasks(session.mode, checked);
  if (!qualifying.length) return { offer: [], credit: false };
  const store = db();
  const [credit, ...answered] = await store.getAll(
    store.collection(CREDITS).doc(sessionKey(uid, checked.map((t) => t.contentKey))),
    ...qualifying.map((t) => consentRef(uid, t.contentKey)),
  );
  return {
    offer: qualifying.filter((_, i) => !answered[i].exists).map((t) => ({ taskType: t.taskType, band: t.band! })),
    credit: !credit.exists,
  };
}

// ── The answer ───────────────────────────────────────────────────────────────

const criteriaOf = (s: BandScores): Criteria => ({
  taskScore: s.taskAchievement,
  cc: s.coherenceCohesion,
  lr: s.lexicalResource,
  gra: s.grammaticalRangeAccuracy,
});

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * The vocabulary from the student's full report, as sample cards. The report
 * adds "instead of: <the student's word>" to each meaning, which means
 * nothing to a reader of the sample, so it goes. A score-only report has none.
 */
export function feedbackVocabulary(raw: string): SampleVocab[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.vocabulary)) return [];
  return parsed.vocabulary
    .map((v: Record<string, unknown>) => ({
      word: str(v?.word, 80),
      meaning: str(v?.english, 300).replace(/\s*[;,.(–—-]?\s*\(?instead of:.*$/is, '').trim(),
      uz: str(v?.uzbek, 200),
      example: str(v?.exampleFromEssay, 400),
    }))
    .filter((v) => v.word && v.meaning && v.uz)
    .slice(0, 12);
}

/** The grammar points of the student's report, kept with the submission for the record. */
export function feedbackGrammar(raw: string): { point: string; explanation: string; example: string; kind: string }[] {
  try {
    const parsed = extractJson(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.grammar)) return [];
    return parsed.grammar
      .map((g: Record<string, unknown>) => ({
        point: str(g?.point, 200),
        explanation: str(g?.explanation, 500),
        example: str(g?.example, 400),
        kind: str(g?.kind, 20),
      }))
      .filter((g) => g.point)
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** A short code that ties the Telegram messages of one share together, like "K7Q2XA". */
function newConsentId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
}

export interface ConsentResult {
  decision: 'yes' | 'no';
  /** The new samples, waiting for the admin, in Task 1, Task 2 order. */
  sampleIds: string[];
  /** Whether this answer earned the free assessment (false on a repeat). */
  credited: boolean;
}

export async function submitConsent(
  uid: string,
  session: Session,
  decision: 'yes' | 'no',
  share: SampleTaskType[],
): Promise<ConsentResult> {
  const store = db();
  const checked = await Promise.all(session.tasks.map((t) => checkTask(uid, t, session.mode)));
  const offered = qualifyingTasks(session.mode, checked);
  if (!offered.length) throw new ConsentError('NOTHING_TO_SHARE', 'None of these essays can be shared.');
  const chosen = decision === 'yes' ? offered.filter((t) => share.includes(t.taskType)) : [];
  if (decision === 'yes' && !chosen.length) throw new ConsentError('NOTHING_TO_SHARE', 'Choose at least one essay to share.');

  const key = sessionKey(uid, checked.map((t) => t.contentKey));
  const consentId = newConsentId();
  const day = currentDayKey();
  const userRef = store.collection('users').doc(uid);
  const creditRef = store.collection(CREDITS).doc(key);
  const limitRef = store.collection(CONSENT_LIMITS).doc(`${uid}_${day}`);
  // Ids are made up front, so the transaction can be retried without
  // creating a second set.
  const ids = new Map(chosen.map((t) => [t.taskType, store.collection(SAMPLES).doc().id]));
  // A student's own question shared for the first time becomes a custom
  // question; a Task 1 one keeps the chart the student marked against.
  const newQuestions = new Map<SampleTaskType, string>();
  for (const t of chosen) {
    if (t.ref?.source !== 'custom' || t.ref.id) continue;
    if (t.taskType === 'task1' && !t.chart) throw new ConsentError('BAD_REQUEST', 'The chart for this question is missing. Open the report again from Relax and try once more.');
    newQuestions.set(t.taskType, `cq_${store.collection(CUSTOM_QUESTIONS).doc().id}`);
  }

  return store.runTransaction(async (tx) => {
    const answered = await tx.getAll(...offered.map((t) => consentRef(uid, t.contentKey)));
    const open = offered.filter((_, i) => !answered[i].exists);
    if (!open.length) throw new ConsentError('ALREADY_DECIDED', 'You have already answered for these essays.');
    const sharing = chosen.filter((t) => open.includes(t));
    if (decision === 'yes' && !sharing.length) throw new ConsentError('ALREADY_DECIDED', 'You have already answered for these essays.');

    let credited = false;
    if (decision === 'yes') {
      const [limit, credit, user] = await tx.getAll(limitRef, creditRef, userRef);
      const used = limit.exists ? Number(limit.get('count')) || 0 : 0;
      if (used >= DAILY_CONSENT_LIMIT) {
        throw new ConsentError('DAILY_LIMIT', `You can share up to ${DAILY_CONSENT_LIMIT} times a day. Please try again tomorrow.`);
      }
      if (!user.exists) throw new ConsentError('NO_PROFILE', 'Your profile was not found.');
      tx.set(limitRef, { uid, day, count: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (!credit.exists) {
        tx.create(creditRef, { uid, consentId, at: FieldValue.serverTimestamp() });
        tx.set(userRef, { bonusAnalyses: FieldValue.increment(1) }, { merge: true });
        credited = true;
      }
    }

    // The student is never asked again about any of these essays: a task left
    // unticked counts as "no".
    for (const t of open) {
      tx.set(consentRef(uid, t.contentKey), {
        uid,
        taskType: t.taskType,
        decision: sharing.includes(t) ? 'yes' : 'no',
        consentId,
        at: FieldValue.serverTimestamp(),
      });
    }

    sharing.forEach((t) => {
      const id = ids.get(t.taskType)!;
      const ref = t.ref!;
      const questionId = ref.id || newQuestions.get(t.taskType)!;
      const custom = ref.source === 'custom';
      if (custom && !ref.id) {
        tx.create(store.collection(CUSTOM_QUESTIONS).doc(questionId), {
          taskType: t.taskType,
          text: ref.text,
          questionKey: questionKeyOf(t.taskType, ref.text),
          ...(t.taskType === 'task1' ? { chart: t.chart } : {}),
          firstSampleId: id,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      const scores = t.saved!.scores;
      const { text: essay, removed } = stripPersonalDetails(t.essay);
      const vocabulary = t.saved!.tier === 'full' ? feedbackVocabulary(t.saved!.raw) : [];
      const imageUrl = t.taskType === 'task1' && ref.slug ? imageUrlFor(ref.slug, ref.imageExt) : '';
      const now = FieldValue.serverTimestamp();
      tx.set(store.collection(SAMPLES).doc(id), {
        questionId,
        slug: ref.slug,
        taskType: t.taskType,
        questionText: ref.text,
        ...(t.taskType === 'task1' ? { imageUrl, imageAlt: ref.imageAlt } : {}),
        sourceType: 'student',
        sampleAnswer: essay,
        band: scores.overall,
        criteria: criteriaOf(scores),
        wordCount: countWords(essay),
        outline: [],
        vocabulary,
        grammarHighlights: [],
        mode: session.mode,
        status: 'pending',
        // The partner channels are credited only on their own (bank) questions.
        ...(custom ? { questionSource: 'custom' } : { sourceCredit: BANK_SOURCE_CREDIT }),
        submissionId: id,
        // For the Telegram header: "Task 1 of 2 • #K7Q2XA". No userId here.
        review: { consentId },
        createdAt: now,
        updatedAt: now,
      });
      tx.set(store.collection(SUBMISSIONS).doc(id), {
        userId: uid,
        consentId,
        sessionKey: key,
        contentKey: t.contentKey,
        sampleId: id,
        questionId,
        questionSource: ref.source,
        taskType: t.taskType,
        mode: session.mode,
        essay,
        personalDetailsRemoved: removed,
        band: scores.overall,
        criteria: criteriaOf(scores),
        wordCount: countWords(essay),
        reportTier: t.saved!.tier,
        vocabulary,
        grammar: t.saved!.tier === 'full' ? feedbackGrammar(t.saved!.raw) : [],
        ...(t.taskType === 'task1' ? { imageUrl } : {}),
        status: 'pending',
        createdAt: now,
      });
    });

    return { decision, sampleIds: sharing.map((t) => ids.get(t.taskType)!), credited };
  });
}
