import { auth } from '@/firebase/firebase';
import type { ReportData, ReportMode } from './reportEncoding';

/**
 * The feedback page's side of "Can we show your essay as a sample answer?"
 * (api/_lib/routes/samples.ts). The page only says which essays it has on
 * screen; the server decides from its own records whether any of them may be
 * offered, so a band or a question id edited in the browser changes nothing.
 */

export type SampleTask = 'task1' | 'task2';

export interface SessionTask {
  taskType: 'Task 1' | 'Task 2';
  questionId?: string;
  question: string;
  essay: string;
  /**
   * Relax Task 1 on the student's own question: the chart they uploaded. It is
   * shared with the essay, so it is sent only with "Yes"; the status check
   * only says it is there (hasChart).
   */
  chart?: string;
  hasChart?: boolean;
}

export interface Offer {
  taskType: SampleTask;
  band: number;
}

/** Every essay of the report link, shared or not: the server keys the free assessment on all of them. */
export function sessionTasks(data: ReportData): SessionTask[] {
  const tasks: SessionTask[] = [];
  if (data.task1?.report && data.userText1?.trim()) {
    const chart = data.task1.image;
    tasks.push({
      taskType: 'Task 1', questionId: data.task1.id, question: data.task1.report, essay: data.userText1,
      ...(chart ? { chart, hasChart: true } : {}),
    });
  }
  if (data.task2?.report && data.userText2?.trim()) {
    tasks.push({ taskType: 'Task 2', questionId: data.task2.id, question: data.task2.report, essay: data.userText2 });
  }
  return tasks;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again.');
  const res = await fetch('/api/samples', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}

/** The essays the student may be asked about, and whether sharing still earns the free assessment. */
export async function fetchOffer(mode: ReportMode, tasks: SessionTask[]): Promise<{ offer: Offer[]; credit: boolean }> {
  const light = tasks.map(({ chart: _chart, ...t }) => t);
  const { offer, credit } = await post<{ offer?: Offer[]; credit?: boolean }>({ action: 'status', mode, tasks: light });
  return { offer: Array.isArray(offer) ? offer : [], credit: credit === true };
}

export function sendConsent(
  mode: ReportMode,
  tasks: SessionTask[],
  decision: 'yes' | 'no',
  share: SampleTask[],
): Promise<{ shared: number; credited: boolean }> {
  return post({ action: 'consent', mode, tasks, decision, share });
}
