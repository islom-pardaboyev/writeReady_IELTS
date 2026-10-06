/**
 * Two limits that keep one student from making the AI write for free. No
 * imports, so scripts/test-security-fixes.ts checks them offline.
 *
 * A full report goes through EVERY sentence of the essay (the prompt says so),
 * and the reply is cut off at the token cap (MAX_TOKENS in api/feedback.ts). A
 * cut-off report is refunded, but the text was already sent to the browser. So
 * an essay of a thousand one-word sentences always hit the cap, was always
 * refunded, and cost a full report each time to write. Two answers:
 *
 *  1. An essay with too many sentences is refused before anything is charged
 *     or written (MAX_SENTENCES).
 *  2. Reports the AI started but could not finish are counted per student
 *     per day (MAX_AI_REFUNDS_PER_DAY). They are always refunded: a student
 *     never pays for a report they did not get. Once the count is reached,
 *     api/pre-check.ts pauses new reports until the next day, so a script
 *     can make the AI write for free only a few times a day. A student whose
 *     reports fail for our reasons is rarely near it. Refunds for problems
 *     found before the AI is asked are not counted.
 */

/** A real IELTS answer is a few dozen sentences. 1,000 words at 10 words a sentence is 100. */
export const MAX_SENTENCES = 100;

/** Sentences as the report would go through them: full stops, and lines. */
export function countSentences(text: string): number {
  return text
    .split(/[.!?…]+(?=\s|$)|\n+/)
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .length;
}

/** Reports a day, per student, the AI may start and fail before new ones pause. */
export const MAX_AI_REFUNDS_PER_DAY = 5;

export interface RefundUsage {
  dayKey?: string;
  count?: number;
}

/** Failed reports already refunded today, from the student's stored `aiRefunds`. */
function usedToday(current: unknown, dayKey: string): number {
  const c = (current && typeof current === 'object' ? current : {}) as RefundUsage;
  return c.dayKey === dayKey && typeof c.count === 'number' && c.count > 0 ? c.count : 0;
}

/**
 * What to store after one more refund of a report the AI had started.
 * `current` is the student's stored `aiRefunds`, `dayKey` today's key
 * (currentDayKey in api/_lib/shared.ts).
 */
export function nextRefundUsage(current: unknown, dayKey: string): { dayKey: string; count: number } {
  return { dayKey, count: usedToday(current, dayKey) + 1 };
}

/** True once today's failed reports reach the limit: new reports wait for tomorrow. */
export function reportsPaused(current: unknown, dayKey: string): boolean {
  return usedToday(current, dayKey) >= MAX_AI_REFUNDS_PER_DAY;
}
