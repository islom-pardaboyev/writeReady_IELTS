import type { Dispatch, SetStateAction } from "react";

export type AdminSection =
  | "home"
  | "task1"
  | "task2"
  | "blog"
  | "announcements"
  | "telegram"
  | "users"
  | "leaderboard"
  | "centers"
  | "teachers"
  | "settings";

/** A request from another screen, e.g. Home asking Users to open a record. */
export interface Intent {
  section: AdminSection;
  action?: "new" | "search";
  id?: string;
  filter?: string;
}

export interface SectionProps {
  intent: Intent | null;
  clearIntent: () => void;
}

export interface Task1 { id: string; image: string; report: string; }
export interface Task2 { id: string; report: string; }

export interface UserRow {
  id: string;
  email: string;
  plan: string;
  subscription?: string;
  expiresAt?: string;
  createdAt?: string;
  balanceUZS?: number;
  /** When they were last on the site, as an ISO string. Empty if never seen. */
  lastActiveAt?: string;
  /** This month's AI feedback usage against the plan's quota — see api/pre-check.ts. */
  usage?: { monthKey: string; count: number };
  /** Admin-granted full reports, spent after the plan's monthly quota runs out. */
  bonusAnalyses?: number;
  /** The free plan's one-report-a-week allowance — see src/lib/weeklyFree.ts. */
  freeUsage?: { weekKey: string; count: number };
  /** Shown as a "Founding student" badge on their own account page. */
  founder?: boolean;
}

export interface PendingReview {
  id: string;
  requestedAt: Date | null;
  teacherId: string;
  teacherName: string;
  studentName: string;
}

export type SetState<T> = Dispatch<SetStateAction<T>>;
