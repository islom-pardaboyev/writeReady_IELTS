import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from './config';
import type { Teacher, HumanReview, HumanReviewTaskPart } from '../types';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return new Date();
}

function mapTeacher(id: string, data: Record<string, any>): Teacher {
  return {
    id,
    name: data.name ?? '',
    photoBase64: data.photoBase64 ?? undefined,
    certificateBase64: data.certificateBase64 ?? undefined,
    ieltsOverall: data.ieltsOverall ?? 0,
    ieltsWriting: data.ieltsWriting ?? 0,
    login: data.login ?? '',
    password: data.password ?? '',
    active: data.active ?? true,
    createdAt: toDate(data.createdAt),
  };
}

// ── Teachers ────────────────────────────────────────────────────────────────
// Every function takes an optional Firestore instance so callers running under
// the isolated admin/teacher-portal Firebase app (adminDb) don't touch the
// main app's `db` instance, matching the existing Learning Center convention.

export async function getTeachers(dbInstance: Firestore = db): Promise<Teacher[]> {
  const snap = await getDocs(query(collection(dbInstance, 'teachers'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => mapTeacher(d.id, d.data()));
}

export async function getActiveTeachers(dbInstance: Firestore = db): Promise<Teacher[]> {
  const teachers = await getTeachers(dbInstance);
  return teachers.filter((t) => t.active);
}

export async function getTeacher(teacherId: string, dbInstance: Firestore = db): Promise<Teacher | null> {
  const snap = await getDoc(doc(dbInstance, 'teachers', teacherId));
  if (!snap.exists()) return null;
  return mapTeacher(snap.id, snap.data());
}

export async function findTeacherByLogin(login: string, dbInstance: Firestore = db): Promise<Teacher | null> {
  const snap = await getDocs(query(collection(dbInstance, 'teachers'), where('login', '==', login)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapTeacher(d.id, d.data());
}

export interface CreateTeacherInput {
  name: string;
  photoBase64?: string;
  certificateBase64?: string;
  ieltsOverall: number;
  ieltsWriting: number;
  login: string;
  password: string;
}

export async function createTeacher(input: CreateTeacherInput, dbInstance: Firestore = db): Promise<string> {
  const ref = await addDoc(collection(dbInstance, 'teachers'), {
    ...input,
    active: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTeacher(
  teacherId: string,
  updates: Partial<CreateTeacherInput & { active: boolean }>,
  dbInstance: Firestore = db,
): Promise<void> {
  await updateDoc(doc(dbInstance, 'teachers', teacherId), updates);
}

export async function deleteTeacher(teacherId: string, dbInstance: Firestore = db): Promise<void> {
  await deleteDoc(doc(dbInstance, 'teachers', teacherId));
}

// ── Human reviews ───────────────────────────────────────────────────────────

function mapReview(id: string, data: Record<string, any>): HumanReview {
  return {
    id,
    uid: data.uid ?? '',
    studentName: data.studentName ?? '',
    studentEmail: data.studentEmail ?? '',
    teacherId: data.teacherId ?? '',
    teacherName: data.teacherName ?? '',
    mode: data.mode ?? 'quick',
    task1: data.task1 ?? undefined,
    task2: data.task2 ?? undefined,
    status: data.status ?? 'pending',
    feedbackDocBase64: data.feedbackDocBase64 ?? undefined,
    feedbackFileName: data.feedbackFileName ?? undefined,
    requestedAt: toDate(data.requestedAt),
    checkedAt: data.checkedAt ? toDate(data.checkedAt) : undefined,
  };
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

export async function createHumanReview(input: CreateHumanReviewInput, dbInstance: Firestore = db): Promise<string> {
  // Firestore rejects `undefined` field values, so only include the task parts
  // that are actually present (an essay may have just Task 1 or just Task 2).
  const payload: Record<string, unknown> = {
    uid: input.uid,
    studentName: input.studentName,
    studentEmail: input.studentEmail,
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    mode: input.mode,
    status: 'pending',
    requestedAt: serverTimestamp(),
  };
  if (input.task1 !== undefined) payload.task1 = input.task1;
  if (input.task2 !== undefined) payload.task2 = input.task2;

  const ref = await addDoc(collection(dbInstance, 'humanReviews'), payload);
  return ref.id;
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
