export type Plan = 'free' | 'pro' | 'forever';
export type PracticeMode = 'mock' | 'practice' | 'relax';
export type TaskType = 'task1' | 'task2';

export interface UserProfile {
  uid: string;
  email: string;
  plan: Plan;
  subscriptionExpiresAt: Date | null;
  createdAt: Date;
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
