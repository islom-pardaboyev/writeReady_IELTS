export type Plan = 'free' | 'basic' | 'standard' | 'premium' | 'forever';

export interface UserProfile {
  uid: string;
  email: string;
  plan: Plan;
  subscription?: string;
  subscriptionExpiresAt: Date | null;
  createdAt: Date;
  bonusAnalyses?: number;
  freeUsage?: { weekKey?: string; count?: number };
  notification?: string;
  centerId?: string;
  centerName?: string;
  studentLogin?: string;
  balanceUZS?: number;
}

export interface UsageRecord {
  uid: string;
  yearMonth: string;
  count: number;
  limit: number;
  updatedAt: Date;
}

// ── Enhanced feedback (api/feedback.ts) ────────────────────────────────────

export interface FeedbackScores {
  taskAchievement: number;
  coherenceCohesion: number;
  lexicalResource: number;
  grammaticalRangeAccuracy: number;
  overall: number;
}

export interface CategoryFeedback {
  strengths: string[];
  issues: string[];
}

export interface EnhancedFeedbackCategories {
  taskAchievement: CategoryFeedback;
  coherenceCohesion: CategoryFeedback;
  lexicalResource: CategoryFeedback;
  grammaticalRangeAccuracy: CategoryFeedback;
}

export interface VocabItem {
  word: string;
  uzbek: string;
  english: string;
  exampleFromEssay: string;
}

export interface GrammarPoint {
  point: string;
  explanation: string;
  example: string;
}

export type SentenceIssueType = 'word_choice' | 'grammar' | 'coherence' | 'structure' | 'ok';

export interface SentenceAnalysis {
  sentence: string;
  type: SentenceIssueType;
  feedback: string;
  improved: string;
}

export interface EnhancedFeedbackResult {
  taskType: 'Task 1' | 'Task 2';
  topic: string;
  wordCount: number;
  scores: FeedbackScores;
  feedback: EnhancedFeedbackCategories;
  priorityFixes: string[];
  bandGapAnalysis: string;
  sampleResponse: string;
  sentenceAnalysis: SentenceAnalysis[];
  vocabulary: VocabItem[];
  grammar: GrammarPoint[];
  limited?: boolean;
}

// ── Human Check (teacher review) ───────────────────────────────────────────

export interface Teacher {
  id: string;
  name: string;
  photoBase64?: string;
  certificateBase64?: string;
  ieltsOverall: number;
  ieltsWriting: number;
  /** Portal login and password. Stored in teacherAuth, not on the public
   *  profile, and filled in only for the admin panel (getTeachers withLogins). */
  login: string;
  password: string;
  /** "@username" — used to tag the teacher in the teachers' Telegram group. */
  telegram?: string;
  active: boolean;
  createdAt: Date;
}

export interface HumanReviewTaskPart {
  questionText: string;
  essayText: string;
  /** A chart the student uploaded themselves, as a data URL. */
  imageBase64?: string;
  /** Task 1 prompt id, for charts stored in Firestore. */
  imagePromptId?: string;
}

export type HumanReviewStatus = 'pending' | 'checked';

export interface HumanReview {
  id: string;
  uid: string;
  studentName: string;
  studentEmail: string;
  teacherId: string;
  teacherName: string;
  mode: 'mock' | 'practice' | 'quick' | 'relax';
  task1?: HumanReviewTaskPart;
  task2?: HumanReviewTaskPart;
  status: HumanReviewStatus;
  priceUZS: number;
  platformFeeUZS: number;
  feedbackDocBase64?: string;
  feedbackFileName?: string;
  requestedAt: Date;
  checkedAt?: Date;
}
