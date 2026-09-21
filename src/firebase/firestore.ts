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
  addDoc,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from './config';
import { effectivePlan, monthlyLimitFor } from '../lib/plans';
import type { UserProfile, UsageRecord, Question, Submission } from '../types';

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
    notification: '🎁 Xush kelibsiz! Har hafta 1 marta bepul AI tahlil olishingiz mumkin. Sinab ko\'ring!',
  });
}

// Wipes every Firestore record tied to a user (profile, feedback reports,
// submissions, human-check reviews, notifications). Does NOT remove the
// Firebase Auth account itself — that needs a server-side Admin SDK call,
// which this project doesn't have; the admin panel only has Firestore access.
// Takes an optional Firestore instance so the admin panel (which runs under
// its own isolated Firebase app/auth session, see teachers.ts) can pass its
// own `adminDb` instead of the main site's `db`.
export async function deleteUserAccount(uid: string, dbInstance: Firestore = db): Promise<void> {
  const uidFilteredCollections = ['feedback_reports', 'submissions', 'humanReviews'];
  for (const col of uidFilteredCollections) {
    const snap = await getDocs(query(collection(dbInstance, col), where('uid', '==', uid)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }

  const notifSnap = await getDocs(collection(dbInstance, 'notifications', uid, 'items'));
  await Promise.all(notifSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(doc(dbInstance, 'users', uid));
}

export async function getUsage(uid: string): Promise<UsageRecord | null> {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const usage = data?.usage;
  const count = usage?.monthKey === yearMonth ? (usage?.count ?? 0) : 0;
  // A learning-center student's plan is the one their center bought, stored on
  // their own profile, so the same lookup covers them — see src/lib/plans.ts.
  const limit = monthlyLimitFor(effectivePlan(data));
  return { uid, yearMonth, count, limit, updatedAt: new Date() };
}

export async function getQuestions(count = 10): Promise<Question[]> {
  const q = query(
    collection(db, 'questions'),
    orderBy('dateAdded', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      taskType: data.taskType,
      topic: data.topic,
      promptText: data.promptText,
      category: data.category,
      dateAdded: toDate(data.dateAdded),
      source: data.source,
    };
  });
}

export async function getQuestion(id: string): Promise<Question | null> {
  const snap = await getDoc(doc(db, 'questions', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    taskType: d.taskType,
    topic: d.topic,
    promptText: d.promptText,
    category: d.category,
    dateAdded: toDate(d.dateAdded),
    source: d.source,
  };
}

export async function saveSubmission(
  uid: string,
  data: Omit<Submission, 'id' | 'uid' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'submissions'), {
    uid,
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserSubmissions(uid: string): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: data.uid,
        questionId: data.questionId,
        questionText: data.questionText,
        essayText: data.essayText,
        mode: data.mode,
        feedback: data.feedback,
        createdAt: toDate(data.createdAt),
      } as Submission;
    })
    .filter((s) => s.uid === uid);
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

// ── Questions ──────────────────────────────────────────────────────────────

export async function seedQuestions(): Promise<void> {
  const sampleQuestions = [
    {
      taskType: 'task2',
      topic: 'Technology',
      promptText:
        'Some people think that modern technology has made our lives more complicated. Others believe it has simplified them. Discuss both views and give your own opinion.',
      category: 'Opinion',
      dateAdded: serverTimestamp(),
      source: 'Sample',
    },
    {
      taskType: 'task2',
      topic: 'Education',
      promptText:
        'Many universities are now offering online courses instead of traditional face-to-face teaching. Do you think this is a positive or negative development?',
      category: 'Positive/Negative',
      dateAdded: serverTimestamp(),
      source: 'Sample',
    },
    {
      taskType: 'task2',
      topic: 'Environment',
      promptText:
        'The increase in the production of consumer goods results in damage to the natural environment. What are the causes of this? What can be done to solve this problem?',
      category: 'Problem/Solution',
      dateAdded: serverTimestamp(),
      source: 'Sample',
    },
    {
      taskType: 'task2',
      topic: 'Health',
      promptText:
        'In many countries, the average weight of people is increasing and their levels of health and fitness are decreasing. What do you think are the causes of these problems and what measures could be taken to solve them?',
      category: 'Problem/Solution',
      dateAdded: serverTimestamp(),
      source: 'Sample',
    },
    {
      taskType: 'task2',
      topic: 'Society',
      promptText:
        'Some people believe that it is best to accept a bad situation, such as an unsatisfactory job or shortage of money. Others argue that it is better to try to improve such situations. Discuss both views and give your own opinion.',
      category: 'Opinion',
      dateAdded: serverTimestamp(),
      source: 'Sample',
    },
    {
      taskType: 'task1',
      topic: 'Charts',
      promptText:
        'The chart below shows information about changes in average house prices in five different cities between 1990 and 2002 compared with the average house prices in 1989. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      category: 'Bar Chart',
      dateAdded: serverTimestamp(),
      source: 'Sample',
    },
  ];

  for (const q of sampleQuestions) {
    await addDoc(collection(db, 'questions'), q);
  }
}
