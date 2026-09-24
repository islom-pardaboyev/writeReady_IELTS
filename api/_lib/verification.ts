import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './db.js';
import { CRITERIA, normalizeScores, writingBand, type BandScores } from './bandScore.js';
import { hmacBytes, sign, verifySignature } from './seal.js';
import { reportSignatureValid, type TaskType } from './savedReports.js';
import { CODE_ALPHABET, CODE_LENGTH, cleanCardName } from './verifyCode.js';

/**
 * Score-card verification: a short code on a card opens a public page that
 * shows the name and bands WriteReady really gave.
 *
 * A verification is built only from feedback_reports entries the server
 * signed, owned by the student asking, so a student cannot verify a score
 * they did not get. The record is signed too, so one written by hand (the
 * Firestore rules have at times let any signed-in user write anything) fails
 * the check and the public page says the code cannot be verified.
 */

const COLLECTION = 'score_verifications';

export interface VerifiedTask {
  taskType: TaskType;
  scores: BandScores;
  /** When the essay was marked, as an ISO date. */
  markedAt: string;
}

export interface Verification {
  code: string;
  uid: string;
  name: string;
  /** One task, or a full test with both tasks and the Writing band. */
  kind: 'task' | 'full';
  reportIds: string[];
  tasks: VerifiedTask[];
  writing: { band: number; weighted: number } | null;
  revoked: boolean;
}

export class VerificationError extends Error {
  constructor(public code: 'BAD_INPUT' | 'NOT_FOUND' | 'NOT_OWNER' | 'UNSIGNED' | 'MISMATCH') { super(code); }
}

/**
 * The same student, reports and name always give the same code, so a card
 * can be previewed with its real code before anything is saved.
 */
export function verificationCode(uid: string, reportIds: string[], name: string): string {
  const bytes = hmacBytes('verification-code', [uid, [...reportIds].sort().join(','), name].join('|'));
  const bits = [...bytes.subarray(0, 5)].map((b) => b.toString(2).padStart(8, '0')).join('');
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
  return code;
}

function payload(v: Verification): string {
  return JSON.stringify([
    v.code, v.uid, v.name, v.kind, v.reportIds,
    v.tasks.map((t) => [t.taskType, CRITERIA.map((k) => t.scores[k]), t.markedAt]),
    v.writing ? [v.writing.band, v.writing.weighted] : null,
    v.revoked,
  ]);
}

const isoDate = (value: unknown) =>
  value instanceof Timestamp ? value.toDate().toISOString() : new Date(0).toISOString();

/**
 * The verification a student may make for these reports, checked against
 * the database. Throws VerificationError when it is not allowed.
 */
export async function buildVerification(uid: string, reportIds: unknown, rawName: unknown): Promise<Verification> {
  if (!Array.isArray(reportIds) || reportIds.length < 1 || reportIds.length > 2) throw new VerificationError('BAD_INPUT');
  if (!reportIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(id))) throw new VerificationError('BAD_INPUT');
  if (new Set(reportIds).size !== reportIds.length) throw new VerificationError('BAD_INPUT');
  const name = cleanCardName(typeof rawName === 'string' ? rawName : '');

  const store = db();
  const snaps = await store.getAll(...(reportIds as string[]).map((id) => store.collection('feedback_reports').doc(id)));
  const tasks: VerifiedTask[] = [];
  for (const snap of snaps) {
    if (!snap.exists) throw new VerificationError('NOT_FOUND');
    const data = snap.data() ?? {};
    if (data.uid !== uid) throw new VerificationError('NOT_OWNER');
    if (!reportSignatureValid(snap.id, data)) throw new VerificationError('UNSIGNED');
    const scores = normalizeScores(data.scores);
    if (!scores || (data.taskType !== 'Task 1' && data.taskType !== 'Task 2')) throw new VerificationError('UNSIGNED');
    tasks.push({ taskType: data.taskType, scores, markedAt: isoDate(data.createdAt) });
  }

  let writing: Verification['writing'] = null;
  if (tasks.length === 2) {
    // A full test is one Task 1 and one Task 2, shown in that order.
    tasks.sort((a, b) => a.taskType.localeCompare(b.taskType));
    if (tasks[0].taskType !== 'Task 1' || tasks[1].taskType !== 'Task 2') throw new VerificationError('MISMATCH');
    writing = writingBand(tasks[0].scores.overall, tasks[1].scores.overall);
  }

  const ids = [...(reportIds as string[])].sort();
  return {
    code: verificationCode(uid, ids, name),
    uid,
    name,
    kind: tasks.length === 2 ? 'full' : 'task',
    reportIds: ids,
    tasks,
    writing,
    revoked: false,
  };
}

/** The fields a verification is stored with, signed. Exported for scripts/test-score-consistency.ts. */
export function signedRecord(v: Verification) {
  return { ...v, sig: sign('verification', payload(v)) };
}

/** Saves a verification so its code works, or brings back one the student had withdrawn. */
export async function activateVerification(v: Verification): Promise<void> {
  const ref = db().collection(COLLECTION).doc(v.code);
  const existed = (await ref.get()).exists;
  await ref.set({
    ...signedRecord({ ...v, revoked: false }),
    updatedAt: FieldValue.serverTimestamp(),
    ...(existed ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
}

export type ReadResult =
  | { status: 'valid'; verification: Verification; issuedAt: string }
  | { status: 'revoked' }
  | { status: 'not_found' };

/**
 * A stored record as a Verification, or null when its signature does not
 * match (forged or edited). Exported for scripts/test-score-consistency.ts.
 */
export function recordFromDoc(code: string, data: Record<string, unknown>): Verification | null {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const v: Verification = {
    code,
    uid: typeof data.uid === 'string' ? data.uid : '',
    name: typeof data.name === 'string' ? data.name : '',
    kind: data.kind === 'full' ? 'full' : 'task',
    reportIds: Array.isArray(data.reportIds) ? data.reportIds.filter((x): x is string => typeof x === 'string') : [],
    tasks: tasks.flatMap((t: Record<string, unknown>) => {
      const scores = normalizeScores(t?.scores);
      const taskType = t?.taskType === 'Task 1' || t?.taskType === 'Task 2' ? t.taskType : null;
      return scores && taskType ? [{ taskType, scores, markedAt: typeof t.markedAt === 'string' ? t.markedAt : '' }] : [];
    }),
    writing: data.writing && typeof data.writing === 'object'
      ? {
          band: Number((data.writing as Record<string, unknown>).band),
          weighted: Number((data.writing as Record<string, unknown>).weighted),
        }
      : null,
    revoked: data.revoked === true,
  };
  return verifySignature('verification', payload(v), data.sig) ? v : null;
}

/** A verification as the public page may show it. A forged or edited record reads as not found. */
export async function readVerification(code: string): Promise<ReadResult> {
  const snap = await db().collection(COLLECTION).doc(code).get();
  if (!snap.exists) return { status: 'not_found' };
  const v = recordFromDoc(code, snap.data() ?? {});
  if (!v) {
    console.error(`verify: record ${code} failed its signature check`);
    return { status: 'not_found' };
  }
  if (v.revoked) return { status: 'revoked' };
  return { status: 'valid', verification: v, issuedAt: isoDate(snap.get('createdAt')) };
}

/** The student's own live verifications, newest first. */
export async function listVerifications(uid: string): Promise<{ verification: Verification; issuedAt: string }[]> {
  const snap = await db().collection(COLLECTION).where('uid', '==', uid).limit(100).get();
  return snap.docs
    .flatMap((doc) => {
      const v = recordFromDoc(doc.id, doc.data());
      return v && !v.revoked && v.uid === uid ? [{ verification: v, issuedAt: isoDate(doc.get('createdAt')) }] : [];
    })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

/** Withdraws a verification. Only its owner can. False when there is nothing of theirs to withdraw. */
export async function revokeVerification(uid: string, code: string): Promise<boolean> {
  const ref = db().collection(COLLECTION).doc(code);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const v = recordFromDoc(code, snap.data() ?? {});
  if (!v || v.uid !== uid) return false;
  const { sig } = signedRecord({ ...v, revoked: true });
  await ref.set({ revoked: true, sig, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}
