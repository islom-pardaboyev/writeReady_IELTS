export type Plan = 'free' | 'basic' | 'standard' | 'premium' | 'forever';
export type PracticeMode = 'mock' | 'practice' | 'relax';
export type TaskType = 'task1' | 'task2';

export interface UserProfile {
  uid: string;
  email: string;
  plan: Plan;
  subscription?: string;
  subscriptionExpiresAt: Date | null;
  createdAt: Date;
  bonusAnalyses?: number;
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

export interface Question {
  id: string;
  taskType: TaskType;
  topic: string;
  promptText: string;
  category: string;
  dateAdded: Date;
  source?: string;
}

export interface SentenceFeedback {
  sentence: string;
  original: string;
  correction?: string;
  explanation?: string;
  type: 'grammar' | 'coherence' | 'style' | 'ok';
}

export interface VocabUpgrade {
  word: string;
  uzbekMeaning: string;
  englishMeaning: string;
  exampleSentence: string;
}

export interface FeedbackResult {
  sentenceFeedback: SentenceFeedback[];
  vocabUpgrades: VocabUpgrade[];
  taskAchievementNotes: string;
  overallSummary: string;
  bandEstimate: number;
  modelParagraph: string;
}

export interface Submission {
  id: string;
  uid: string;
  questionId: string;
  questionText: string;
  essayText: string;
  mode: PracticeMode;
  feedback?: FeedbackResult;
  createdAt: Date;
}

export interface AnalyzeRequest {
  essayText: string;
  questionText: string;
  mode: PracticeMode;
  idToken: string;
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
  login: string;
  password: string;
  active: boolean;
  createdAt: Date;
}

export interface HumanReviewTaskPart {
  questionText: string;
  essayText: string;
  imageBase64?: string;
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
