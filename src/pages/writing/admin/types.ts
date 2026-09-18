import type { Dispatch, SetStateAction } from "react";

export type AdminSection =
  | "home"
  | "task1"
  | "task2"
  | "blog"
  | "announcements"
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
}

export interface PendingReview {
  id: string;
  requestedAt: Date | null;
  teacherId: string;
  teacherName: string;
  studentName: string;
}

export type SetState<T> = Dispatch<SetStateAction<T>>;
