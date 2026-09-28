import { doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { countWords, MIN_WORDS } from "@/lib/pdfShared";
import { localDayKey } from "@/lib/dashboardStats";

// The dashboard's day streak counts the days a student wrote. A checked essay
// leaves a report behind, but a Free student gets one check a week, so a
// report alone could never make a streak longer than a day. Finishing an
// essay (saving its PDF) counts too, and is recorded here: one document per
// student, activity/{uid}, holding essays finished per local day,
// { days: { "2026-09-28": 2 } }. The dashboard reads it with the reports.

export interface FinishedTask {
  taskNum: 1 | 2;
  answer: string;
}

// Answers already counted in this visit, so pressing Finish twice on the same
// essay counts it once.
const counted = new Set<string>();

/**
 * Counts the essays a student just saved towards their streak. Only answers
 * that reach the task's minimum (150 words for Task 1, 250 for Task 2) count,
 * so an empty page cannot keep a streak alive. Never throws and never delays
 * the PDF: a failed write only means that day is missing from the streak.
 */
export function recordFinishedEssays(uid: string | undefined, tasks: FinishedTask[]): void {
  if (!uid) return;
  const fresh = tasks
    .filter((t) => countWords(t.answer) >= MIN_WORDS[t.taskNum])
    .map((t) => `${uid}:${t.taskNum}:${t.answer.trim()}`)
    .filter((key) => !counted.has(key));
  if (fresh.length === 0) return;

  fresh.forEach((key) => counted.add(key));
  setDoc(
    doc(db, "activity", uid),
    { days: { [localDayKey(new Date())]: increment(fresh.length) }, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch((err) => {
    fresh.forEach((key) => counted.delete(key));
    console.error("Could not record the finished essay for the streak:", err);
  });
}
