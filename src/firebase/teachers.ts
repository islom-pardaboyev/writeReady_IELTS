import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc,
  serverTimestamp,
  Timestamp,
  runTransaction,
  writeBatch,
  deleteField,
  type Firestore,
} from 'firebase/firestore';
import { db } from './config';
import type { Teacher, HumanReview, HumanReviewTaskPart } from '../types';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return new Date();
}

function mapTeacher(id: string, data: Record<string, unknown>): Teacher {
  return {
    id,
    name: (data.name as string) ?? '',
    photoBase64: (data.photoBase64 as string) ?? undefined,
    certificateBase64: (data.certificateBase64 as string) ?? undefined,
    ieltsOverall: (data.ieltsOverall as number) ?? 0,
    ieltsWriting: (data.ieltsWriting as number) ?? 0,
    login: (data.login as string) ?? '',
    password: (data.password as string) ?? '',
    telegram: (data.telegram as string) ?? undefined,
    active: (data.active as boolean) ?? true,
    createdAt: toDate(data.createdAt),
  };
}

// ── Teachers ────────────────────────────────────────────────────────────────
// Every function takes an optional Firestore instance so callers running under
// the isolated admin/teacher-portal Firebase app (adminDb) don't touch the
// main app's `db` instance, matching the existing Learning Center convention.
//
// A teacher's public profile (`teachers`) is readable by every signed-in
// student, because students pick a teacher from it. So the portal login and
// password live apart, in `teacherAuth/<teacherId>`, which only the admin and
// api/staff-login.ts can read. They used to sit on the public profile, where
// any student could read them and sign in as the teacher.

const TEACHER_AUTH = 'teacherAuth';

/** All teachers. Pass `withLogins` from the admin panel to fill in login and password. */
export async function getTeachers(dbInstance: Firestore = db, opts: { withLogins?: boolean } = {}): Promise<Teacher[]> {
  const snap = await getDocs(query(collection(dbInstance, 'teachers'), orderBy('createdAt', 'desc')));
  const teachers = snap.docs.map((d) => mapTeacher(d.id, d.data()));
  if (!opts.withLogins) return teachers;
  const logins = await getDocs(collection(dbInstance, TEACHER_AUTH));
  const byId = new Map(logins.docs.map((d) => [d.id, d.data()]));
  return teachers.map((t) => {
    const auth = byId.get(t.id);
    if (!auth) return t;
    return { ...t, login: (auth.login as string) ?? t.login, password: (auth.password as string) ?? t.password };
  });
}

export async function getActiveTeachers(dbInstance: Firestore = db): Promise<Teacher[]> {
  const teachers = await getTeachers(dbInstance);
  return teachers.filter((t) => t.active);
}

/**
 * Moves logins saved on the public profile, before teacherAuth existed, to
 * teacherAuth. Each teacher moves in the same batch that deletes the public
 * copy, so a login is never lost half way. The admin panel runs this when it
 * lists teachers; api/staff-login.ts also moves a teacher when they sign in.
 * Returns how many teachers were moved.
 */
export async function secureLegacyTeacherLogins(dbInstance: Firestore = db): Promise<number> {
  const snap = await getDocs(collection(dbInstance, 'teachers'));
  const legacy = snap.docs.filter((d) => 'login' in d.data() || 'password' in d.data());
  if (!legacy.length) return 0;
  const batch = writeBatch(dbInstance);
  for (const d of legacy) {
    const { login, password } = d.data();
    batch.set(doc(dbInstance, TEACHER_AUTH, d.id), { login: login ?? '', password: password ?? '' }, { merge: true });
    batch.update(d.ref, { login: deleteField(), password: deleteField() });
  }
  await batch.commit();
  return legacy.length;
}

export interface CreateTeacherInput {
  name: string;
  photoBase64?: string;
  certificateBase64?: string;
  ieltsOverall: number;
  ieltsWriting: number;
  login: string;
  password: string;
  telegram: string;
}

export async function createTeacher(input: CreateTeacherInput, dbInstance: Firestore = db): Promise<string> {
  const { login, password, ...profile } = input;
  const ref = doc(collection(dbInstance, 'teachers'));
  const batch = writeBatch(dbInstance);
  batch.set(ref, { ...profile, active: true, createdAt: serverTimestamp() });
  batch.set(doc(dbInstance, TEACHER_AUTH, ref.id), { login, password });
  await batch.commit();
  return ref.id;
}

export async function updateTeacher(
  teacherId: string,
  updates: Partial<CreateTeacherInput & { active: boolean }>,
  dbInstance: Firestore = db,
): Promise<void> {
  const { login, password, ...profile } = updates;
  const batch = writeBatch(dbInstance);
  if (login !== undefined || password !== undefined) {
    batch.set(doc(dbInstance, TEACHER_AUTH, teacherId), {
      ...(login !== undefined ? { login } : {}),
      ...(password !== undefined ? { password } : {}),
    }, { merge: true });
    // Clears a copy left on the public profile by the old code.
    batch.update(doc(dbInstance, 'teachers', teacherId), { ...profile, login: deleteField(), password: deleteField() });
  } else {
    batch.update(doc(dbInstance, 'teachers', teacherId), profile);
  }
  await batch.commit();
}

export async function deleteTeacher(teacherId: string, dbInstance: Firestore = db): Promise<void> {
  const batch = writeBatch(dbInstance);
  batch.delete(doc(dbInstance, 'teachers', teacherId));
  batch.delete(doc(dbInstance, TEACHER_AUTH, teacherId));
  await batch.commit();
}

// ── Human reviews ───────────────────────────────────────────────────────────

function mapReview(id: string, data: Record<string, unknown>): HumanReview {
  return {
    id,
    uid: (data.uid as string) ?? '',
    studentName: (data.studentName as string) ?? '',
    studentEmail: (data.studentEmail as string) ?? '',
    teacherId: (data.teacherId as string) ?? '',
    teacherName: (data.teacherName as string) ?? '',
    mode: (data.mode as HumanReview['mode']) ?? 'quick',
    task1: (data.task1 as HumanReviewTaskPart) ?? undefined,
    task2: (data.task2 as HumanReviewTaskPart) ?? undefined,
    status: (data.status as HumanReview['status']) ?? 'pending',
    priceUZS: typeof data.priceUZS === 'number' ? data.priceUZS : 0,
    // Legacy reviews created before the platform-fee feature default to the
    // standard 5,000 UZS fee so historical teacher earnings stay consistent.
    platformFeeUZS: typeof data.platformFeeUZS === 'number' ? data.platformFeeUZS : 5000,
    feedbackDocBase64: (data.feedbackDocBase64 as string) ?? undefined,
    feedbackFileName: (data.feedbackFileName as string) ?? undefined,
    requestedAt: toDate(data.requestedAt),
    checkedAt: data.checkedAt ? toDate(data.checkedAt) : undefined,
  };
}

// What the teacher actually earns for a review = price paid minus the
// platform fee, never below zero.
export function teacherEarningUZS(review: HumanReview): number {
  return Math.max(0, review.priceUZS - review.platformFeeUZS);
}

// No orderBy in these queries on purpose: a `where` equality filter combined
// with `orderBy` on a different field requires a manually-created Firestore
// composite index, which silently fails until that index exists. Sorting the
// small per-teacher/per-student result set client-side avoids that entirely.
function sortByRequestedAtDesc(reviews: HumanReview[]): HumanReview[] {
  return [...reviews].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
}

export async function getHumanReviewsForTeacher(teacherId: string, dbInstance: Firestore = db): Promise<HumanReview[]> {
  const snap = await getDocs(query(collection(dbInstance, 'humanReviews'), where('teacherId', '==', teacherId)));
  return sortByRequestedAtDesc(snap.docs.map((d) => mapReview(d.id, d.data())));
}

export async function getHumanReviewsForStudent(uid: string, dbInstance: Firestore = db): Promise<HumanReview[]> {
  const snap = await getDocs(query(collection(dbInstance, 'humanReviews'), where('uid', '==', uid)));
  return sortByRequestedAtDesc(snap.docs.map((d) => mapReview(d.id, d.data())));
}

export async function getHumanReview(reviewId: string, dbInstance: Firestore = db): Promise<HumanReview | null> {
  const snap = await getDoc(doc(dbInstance, 'humanReviews', reviewId));
  if (!snap.exists()) return null;
  return mapReview(snap.id, snap.data());
}

export interface CreateHumanReviewInput {
  uid: string;
  studentName: string;
  studentEmail: string;
  teacherId: string;
  teacherName: string;
  mode: HumanReview['mode'];
  task1?: HumanReviewTaskPart;
  task2?: HumanReviewTaskPart;
}

export class InsufficientBalanceError extends Error {
  constructor() {
    super('INSUFFICIENT_BALANCE');
  }
}

/**
 * Atomically checks the student's balance and creates the review in one
 * Firestore transaction, so two in-flight requests can never both succeed
 * off the same balance (and a failed/insufficient check never leaves a
 * review behind with no payment).
 */
export async function createHumanReview(
  input: CreateHumanReviewInput,
  priceUZS: number,
  platformFeeUZS: number,
  dbInstance: Firestore = db,
): Promise<string> {
  const userRef = doc(dbInstance, 'users', input.uid);
  const reviewRef = doc(collection(dbInstance, 'humanReviews'));

  await runTransaction(dbInstance, async (tx) => {
    const userSnap = await tx.get(userRef);
    const balance = typeof userSnap.data()?.balanceUZS === 'number' ? (userSnap.data()!.balanceUZS as number) : 0;
    if (balance < priceUZS) throw new InsufficientBalanceError();

    // Firestore rejects `undefined` field values, so only include the task
    // parts that are actually present (an essay may have just Task 1 or 2).
    // priceUZS + platformFeeUZS are snapshotted so the teacher's earning stays
    // fixed even if the admin later changes the price or fee.
    const payload: Record<string, unknown> = {
      uid: input.uid,
      studentName: input.studentName,
      studentEmail: input.studentEmail,
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      mode: input.mode,
      status: 'pending',
      priceUZS,
      platformFeeUZS,
      requestedAt: serverTimestamp(),
    };
    if (input.task1 !== undefined) payload.task1 = input.task1;
    if (input.task2 !== undefined) payload.task2 = input.task2;

    tx.update(userRef, { balanceUZS: balance - priceUZS });
    tx.set(reviewRef, payload);
  });

  return reviewRef.id;
}

export async function uploadTeacherFeedback(
  reviewId: string,
  feedbackDocBase64: string,
  feedbackFileName: string,
  dbInstance: Firestore = db,
): Promise<void> {
  const reviewRef = doc(dbInstance, 'humanReviews', reviewId);
  const snap = await getDoc(reviewRef);
  if (!snap.exists()) throw new Error('Review not found.');
  const data = snap.data();

  await updateDoc(reviewRef, {
    status: 'checked',
    feedbackDocBase64,
    feedbackFileName,
    checkedAt: serverTimestamp(),
  });

  await addDoc(collection(dbInstance, 'notifications', data.uid, 'items'), {
    type: 'human_feedback',
    fromUserName: data.teacherName ?? 'Your teacher',
    reviewId,
    preview: `${data.teacherName ?? 'Your teacher'} reviewed your essay — feedback is ready to download.`,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ── Image compression (client-side, so photos fit comfortably under
// Firestore's 1MB-per-document limit without needing file storage) ─────────

export function compressImageToBase64(file: File, maxDim = 480, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported.')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
