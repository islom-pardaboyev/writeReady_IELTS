import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { UserProfile, UsageRecord, Question, Submission, Plan, SpacedRepItem } from '../types';

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

  // Derive effective plan from subscription field (date string or 'forever')
  let plan: Plan = 'free';
  if (subscription === 'forever' || d.plan === 'forever') {
    plan = 'forever';
  } else if ((subscription && new Date(subscription) > new Date()) || d.plan === 'pro') {
    plan = 'pro';
  }

  return {
    uid,
    email: d.email,
    plan,
    subscription,
    subscriptionExpiresAt: d.subscriptionExpiresAt ? toDate(d.subscriptionExpiresAt) : null,
    createdAt: toDate(d.createdAt),
  };
}

export async function createUserProfile(uid: string, email: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    email,
    plan: 'free',
    subscriptionExpiresAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function getUsage(uid: string): Promise<UsageRecord | null> {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const snap = await getDoc(doc(db, 'usage', `${uid}_${yearMonth}`));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid: d.uid,
    yearMonth: d.yearMonth,
    count: d.count,
    limit: d.limit,
    updatedAt: toDate(d.updatedAt),
  };
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

// ── Spaced Repetition ─────────────────────────────────────────────────────

export async function saveSpacedRepResult(
  uid: string,
  itemId: string,
  itemLabel: string,
  correct: boolean
): Promise<{ nextReviewDate: Date }> {
  const safeId = itemId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
  const docId = `${uid}_${safeId}`;
  const ref = doc(db, 'spaced_rep', docId);
  const snap = await getDoc(ref);

  const prevStreak: number = snap.exists() ? (snap.data().correctStreak ?? 0) : 0;
  const newStreak = correct ? prevStreak + 1 : 0;

  // Anki-style intervals: 1 day → 3 days → 7 days → 14 days
  const daysMap: Record<number, number> = { 0: 1, 1: 1, 2: 3, 3: 7 };
  const days = !correct ? 1 : (daysMap[newStreak] ?? 14);
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + days);

  await setDoc(ref, {
    uid,
    itemId,
    itemLabel,
    correctStreak: newStreak,
    lastReviewed: serverTimestamp(),
    nextReviewDate: Timestamp.fromDate(nextReviewDate),
  });

  return { nextReviewDate };
}

export async function getDueSpacedRepItems(uid: string): Promise<SpacedRepItem[]> {
  const now = Timestamp.fromDate(new Date());
  const q = query(
    collection(db, 'spaced_rep'),
    where('uid', '==', uid),
    where('nextReviewDate', '<=', now),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      itemId: data.itemId,
      uid: data.uid,
      itemLabel: data.itemLabel,
      correctStreak: data.correctStreak ?? 0,
      lastReviewed: toDate(data.lastReviewed),
      nextReviewDate: toDate(data.nextReviewDate),
    };
  });
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
