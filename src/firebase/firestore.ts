import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from './config';
import { effectivePlan } from '../lib/plans';
import type { UserProfile } from '../types';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return new Date();
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  const subscription: string = d.subscription ?? '';
  const centerId: string | undefined = typeof d.centerId === 'string' ? d.centerId : undefined;
  const expiresAt: string = d.expiresAt ?? '';

  // One rule for what the stored fields really grant — see src/lib/plans.ts.
  // It translates the legacy "pro" plan, honours a lifetime `subscription`,
  // and drops a plan whose end date has passed back to free. A learning-center
  // student carries their center's plan and the center's contract end date, so
  // they follow the same rule: when the contract ends, so does their plan.
  const plan = effectivePlan(d);

  return {
    uid,
    email: d.email,
    plan,
    subscription,
    subscriptionExpiresAt: expiresAt ? toDate(expiresAt) : null,
    createdAt: toDate(d.createdAt),
    bonusAnalyses: typeof d.bonusAnalyses === 'number' ? d.bonusAnalyses : 0,
    freeUsage: d.freeUsage && typeof d.freeUsage === 'object'
      ? { weekKey: d.freeUsage.weekKey, count: d.freeUsage.count }
      : undefined,
    notification: typeof d.notification === 'string' ? d.notification : '',
    centerId,
    centerName: typeof d.centerName === 'string' ? d.centerName : undefined,
    studentLogin: typeof d.studentLogin === 'string' ? d.studentLogin : undefined,
    balanceUZS: typeof d.balanceUZS === 'number' ? d.balanceUZS : 0,
  };
}

export async function createUserProfile(uid: string, email: string): Promise<void> {
  // Don't overwrite existing profiles (e.g. learning center students already set up their doc)
  const existing = await getDoc(doc(db, 'users', uid));
  if (existing.exists()) return;
  await setDoc(doc(db, 'users', uid), {
    email,
    plan: 'free',
    subscriptionExpiresAt: null,
    createdAt: serverTimestamp(),
    notification: '🎁 Welcome! You get 1 free AI analysis every week. Give it a try!',
  });
}

// Wipes every Firestore record tied to a user (profile, feedback reports,
// saved reports, score-card verifications, submissions, human-check reviews,
// notifications). A deleted verification makes its QR code read "not found".
// Score locks (score_locks) hold no account id, only the bands an exact text
// earned, so they stay. Does NOT remove the
// Firebase Auth account itself — that needs a server-side Admin SDK call,
// which this project doesn't have; the admin panel only has Firestore access.
// Takes an optional Firestore instance so the admin panel (which runs under
// its own isolated Firebase app/auth session, see teachers.ts) can pass its
// own `adminDb` instead of the main site's `db`.
export async function deleteUserAccount(uid: string, dbInstance: Firestore = db): Promise<void> {
  const uidFilteredCollections = ['feedback_reports', 'saved_reports', 'score_verifications', 'submissions', 'humanReviews'];
  for (const col of uidFilteredCollections) {
    const snap = await getDocs(query(collection(dbInstance, col), where('uid', '==', uid)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }

  const notifSnap = await getDocs(collection(dbInstance, 'notifications', uid, 'items'));
  await Promise.all(notifSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(dbInstance, 'users', uid));
}

// Returns issues from the last N feedback reports (for error-pattern tracking)
export async function getFeedbackReportHistory(uid: string, n = 5): Promise<string[][]> {
  const q = query(
    collection(db, 'feedback_reports'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(n)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data().issues as string[]) ?? []);
}

export interface FeedbackReport {
  id: string;
  taskType: string;
  topic: string;
  scores: Record<string, number>;
  createdAt: Date | null;
}

export async function getRecentFeedbackReports(uid: string, n = 5): Promise<FeedbackReport[]> {
  const q = query(
    collection(db, 'feedback_reports'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(n)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      taskType: data.taskType ?? 'task2',
      topic: data.topic ?? 'General',
      scores: data.scores ?? {},
      createdAt: toDate(data.createdAt),
    };
  });
}

export async function getAllFeedbackReports(uid: string): Promise<FeedbackReport[]> {
  const q = query(
    collection(db, 'feedback_reports'),
    where('uid', '==', uid),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      taskType: data.taskType ?? 'task2',
      topic: data.topic ?? 'General',
      scores: data.scores ?? {},
      createdAt: toDate(data.createdAt),
    };
  });
}

export type AnnouncementCategory = 'announcement' | 'update' | 'maintenance' | 'tip' | 'offer';

export interface Announcement {
  id: string;
  title: string;
  text: string;
  category: AnnouncementCategory;
  link?: string;
  linkLabel?: string;
  createdAt: Date | null;
  active: boolean;
}

// Every announcement the admin has switched on, newest first. Filtered here
// rather than in the query so it needs no composite index.
export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const q = query(
    collection(db, 'announcements'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => d.data().active === true)
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title ?? '',
        text: data.text ?? '',
        category: data.category ?? 'announcement',
        link: data.link ?? '',
        linkLabel: data.linkLabel ?? '',
        createdAt: toDate(data.createdAt),
        active: true,
      };
    });
}
