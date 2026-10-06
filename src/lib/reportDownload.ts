import type { User } from "firebase/auth";
import { db } from "@/firebase/config";
import { extractJson } from "@shared/bandScore";
import { downloadFeedbackPdf } from "@/lib/feedbackPdf";
import { toFeedbackResult, withRealQuotes } from "@/lib/feedbackResult";
import { loadTask1Chart } from "@/lib/task1Chart";

// The dashboard's "Download PDF" on a recent report. The server keeps the
// newest few full reports for each paid student (api/_lib/reportArchive.ts):
// 10 on Premium, 3 on the other paid plans.

async function call<T>(user: User, body: object): Promise<T> {
  const res = await fetch("/api/report-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`);
  return data;
}

/** The report ids the student can download right now, newest first. */
export async function listDownloadableReports(user: User): Promise<string[]> {
  const { ids } = await call<{ ids: string[] }>(user, {});
  return Array.isArray(ids) ? ids : [];
}

interface Archived {
  raw: string;
  essay: string;
  question: string;
  taskType: "Task 1" | "Task 2";
  chartId?: string;
  chartImage?: string;
}

/** Builds the same PDF the feedback page exports, from the kept copy. */
export async function downloadArchivedReport(user: User, reportId: string): Promise<void> {
  const r = await call<Archived>(user, { reportId });
  const parsed = toFeedbackResult(extractJson(r.raw), false, r.taskType);
  if (!parsed) throw new Error("This report could not be opened.");
  const isTask1 = r.taskType === "Task 1";
  const chart = isTask1 ? (r.chartId ? await loadTask1Chart(db, { id: r.chartId }) : "") || r.chartImage || null : null;
  const date = new Date().toISOString().slice(0, 10);
  await downloadFeedbackPdf({
    feedback: withRealQuotes(parsed, r.essay),
    taskNum: isTask1 ? 1 : 2,
    question: r.question,
    imageSrc: chart,
    essay: r.essay,
    fileName: `WriteReady_Feedback_Task${isTask1 ? 1 : 2}_${date}.pdf`,
  });
}
