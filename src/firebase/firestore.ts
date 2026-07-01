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
import type { UserProfile, UsageRecord, Question, Submission, Plan, SpacedRepItem, SRSRating, VocabItem } from '../types';

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

  // Derive effective plan from plan field stored directly in Firestore
  let plan: Plan = 'free';
  if (d.plan === 'forever' || subscription === 'forever') {
    plan = 'forever';
  } else if (d.plan === 'premium') {
    plan = 'premium';
  } else if (d.plan === 'standard') {
    plan = 'standard';
  } else if (d.plan === 'basic') {
    plan = 'basic';
  }

  return {
    uid,
    email: d.email,
    plan,
    subscription,
    subscriptionExpiresAt: d.subscriptionExpiresAt ? toDate(d.subscriptionExpiresAt) : null,
    createdAt: toDate(d.createdAt),
    bonusAnalyses: typeof d.bonusAnalyses === 'number' ? d.bonusAnalyses : 0,
    notification: typeof d.notification === 'string' ? d.notification : '',
    centerName: typeof d.centerName === 'string' ? d.centerName : undefined,
    studentLogin: typeof d.studentLogin === 'string' ? d.studentLogin : undefined,
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
    bonusAnalyses: 1,
    notification: '🎁 Xush kelibsiz! Sizga 1 ta bepul AI tahlil berildi. Sinab ko\'ring!',
  });
}

export async function getUsage(uid: string): Promise<UsageRecord | null> {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const usage = snap.data()?.usage;
  const count = usage?.monthKey === yearMonth ? (usage?.count ?? 0) : 0;
  const plan: string = snap.data()?.plan ?? 'free';
  const planLimits: Record<string, number> = { forever: 9999, premium: 30, standard: 12, basic: 5 };
  const limit = planLimits[plan] ?? 0;
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

// ── Spaced Repetition ─────────────────────────────────────────────────────

// SRS intervals (minutes for 'again', days for the rest)
const SRS_INTERVALS: Record<SRSRating, number> = { again: 0, hard: 1, good: 2, easy: 6 };

export async function saveVocabCards(uid: string, items: VocabItem[]): Promise<void> {
  const now = new Date();
  await Promise.all(
    items.map((v) => {
      const safeId = v.word.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
      const docId = `${uid}_${safeId}`;
      const ref = doc(db, 'spaced_rep', docId);
      return setDoc(ref, {
        uid,
        itemId: v.word,
        itemLabel: v.word,
        word: v.word,
        uzbek: v.uzbek,
        english: v.english,
        exampleFromEssay: v.exampleFromEssay,
        interval: 0,
        easeFactor: 2.5,
        correctStreak: 0,
        lastReviewed: serverTimestamp(),
        nextReviewDate: Timestamp.fromDate(now),
      }, { merge: false });
    })
  );
}

export async function rateVocabCard(
  uid: string,
  itemId: string,
  rating: SRSRating,
  currentInterval: number,
  currentEaseFactor: number,
): Promise<{ nextReviewDate: Date; interval: number; easeFactor: number }> {
  const safeId = itemId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
  const docId = `${uid}_${safeId}`;
  const ref = doc(db, 'spaced_rep', docId);

  // SM-2 style calculation
  const easeDeltas: Record<SRSRating, number> = { again: -0.3, hard: -0.15, good: 0, easy: 0.15 };
  const newEaseFactor = Math.max(1.3, currentEaseFactor + easeDeltas[rating]);

  let newInterval: number;
  if (rating === 'again') {
    newInterval = 0;
  } else if (rating === 'hard') {
    newInterval = Math.max(1, Math.round(currentInterval * 1.2));
  } else if (rating === 'good') {
    newInterval = currentInterval === 0 ? 1 : Math.round(currentInterval * newEaseFactor);
  } else {
    newInterval = currentInterval === 0 ? 4 : Math.round(currentInterval * newEaseFactor * 1.3);
  }

  const nextReviewDate = new Date();
  if (rating === 'again') {
    nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10);
  } else {
    nextReviewDate.setDate(nextReviewDate.getDate() + SRS_INTERVALS[rating]);
  }

  await setDoc(ref, {
    interval: newInterval,
    easeFactor: newEaseFactor,
    correctStreak: rating === 'again' ? 0 : 1,
    lastReviewed: serverTimestamp(),
    nextReviewDate: Timestamp.fromDate(nextReviewDate),
  }, { merge: true });

  return { nextReviewDate, interval: newInterval, easeFactor: newEaseFactor };
}

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

  const daysMap: Record<number, number> = { 0: 1, 1: 1, 2: 3, 3: 7 };
  const days = !correct ? 1 : (daysMap[newStreak] ?? 14);
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + days);

  await setDoc(ref, {
    uid,
    itemId,
    itemLabel,
    word: itemLabel,
    uzbek: '',
    english: '',
    exampleFromEssay: '',
    interval: days,
    easeFactor: 2.5,
    correctStreak: newStreak,
    lastReviewed: serverTimestamp(),
    nextReviewDate: Timestamp.fromDate(nextReviewDate),
  }, { merge: true });

  return { nextReviewDate };
}

export async function getDueSpacedRepItems(uid: string): Promise<SpacedRepItem[]> {
  const now = Timestamp.fromDate(new Date());
  const q = query(
    collection(db, 'spaced_rep'),
    where('uid', '==', uid),
    where('nextReviewDate', '<=', now),
    limit(30)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      itemId: data.itemId,
      uid: data.uid,
      itemLabel: data.itemLabel,
      word: data.word ?? data.itemLabel,
      uzbek: data.uzbek ?? '',
      english: data.english ?? '',
      exampleFromEssay: data.exampleFromEssay ?? '',
      interval: data.interval ?? 0,
      easeFactor: data.easeFactor ?? 2.5,
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

export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const q = query(
    collection(db, 'announcements'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  const activeDocs = snap.docs.filter((d) => d.data().active === true);
  if (activeDocs.length === 0) return null;
  // Pick a random active announcement each visit
  const picked = activeDocs[Math.floor(Math.random() * activeDocs.length)];
  const data = picked.data();
  return {
    id: picked.id,
    title: data.title ?? '',
    text: data.text ?? '',
    category: data.category ?? 'announcement',
    link: data.link ?? '',
    linkLabel: data.linkLabel ?? '',
    createdAt: toDate(data.createdAt),
    active: true,
  };
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
