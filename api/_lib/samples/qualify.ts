import { MODES, type SampleMode, type SampleTaskType } from './model.js';

/**
 * Which essays may be offered as a public sample answer.
 *
 * A task qualifies when its OWN overall band is 7.0 or higher AND its
 * question is a bank question (or, in Relax only, the student's own
 * question, shared with the essay). The band is the one saved on the server
 * for this exact essay (api/_lib/savedReports.ts), never one the browser
 * sends, and the bank question is confirmed on the server too
 * (./consent.ts). Outside Relax, a question that is not in the bank never
 * qualifies.
 *
 *   Mock, Practice  Task 1 and Task 2 are judged separately: one can
 *                   qualify without the other.
 *   Quick Write     one task.
 *   Relax           one task. The student types the question: one that is
 *                   word for word a bank question counts as that question;
 *                   any other is the student's own (custom) question, shared
 *                   with the essay, and for Task 1 only with its chart.
 */

export const MIN_BAND = 7;

/** At most this many consent actions per student per day. */
export const DAILY_CONSENT_LIMIT = 3;

/** How many tasks a session in each mode can hold. */
export const TASKS_PER_MODE: Record<SampleMode, number> = { mock: 2, practice: 2, quickwrite: 1, relax: 1 };

/** 'quick' is what the rest of the site calls Quick Write (Human Check, drafts). */
export function readMode(raw: unknown): SampleMode | null {
  if (raw === 'quick') return 'quickwrite';
  return typeof raw === 'string' && (MODES as readonly string[]).includes(raw) ? (raw as SampleMode) : null;
}

export interface TaskFacts {
  taskType: SampleTaskType;
  /** The overall band the server holds for this essay, or null when it holds none. */
  band: number | null;
  /** The bank question this essay answers, as confirmed on the server; null for a custom question. */
  questionId: string | null;
  /** A Relax essay on the student's own question that may be shared with it (./consent.ts decides). */
  custom?: boolean;
}

export function taskQualifies(t: TaskFacts): boolean {
  return t.band !== null && Number.isFinite(t.band) && t.band >= MIN_BAND && (!!t.questionId || t.custom === true);
}

/**
 * The tasks of one feedback session that may be offered, in Task 1, Task 2
 * order. A session holding more tasks than its mode allows is not one the
 * site made, so it is refused whole.
 */
export function qualifyingTasks<T extends TaskFacts>(mode: SampleMode, tasks: T[]): T[] {
  if (tasks.length === 0 || tasks.length > TASKS_PER_MODE[mode]) return [];
  // Only Relax has the student type the question.
  if (mode !== 'relax' && tasks.some((t) => t.custom)) return [];
  const types = new Set(tasks.map((t) => t.taskType));
  if (types.size !== tasks.length) return [];
  return tasks
    .filter(taskQualifies)
    .sort((a, b) => a.taskType.localeCompare(b.taskType));
}
