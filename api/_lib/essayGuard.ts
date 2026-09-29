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
 *  2. A refund for a report the AI had already started writing comes out of a
 *     small daily budget per student (MAX_AI_REFUNDS_PER_DAY). A student whose
 *     reports fail for our reasons is never near it; a script is stopped.
 *     Refunds for problems found before the AI is asked stay free.
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

/** Refunds a day, per student, for reports the AI had started writing. */
export const MAX_AI_REFUNDS_PER_DAY = 5;

export interface RefundUsage {
  dayKey?: string;
  count?: number;
}

/**
 * What to store after one more refund, or null when today's refunds are used
 * up and the report stays charged. `current` is the student's stored
 * `aiRefunds`, `dayKey` today's key (currentDayKey in api/_lib/shared.ts).
 */
export function nextRefundUsage(current: unknown, dayKey: string): { dayKey: string; count: number } | null {
  const c = (current && typeof current === 'object' ? current : {}) as RefundUsage;
  const used = c.dayKey === dayKey && typeof c.count === 'number' && c.count > 0 ? c.count : 0;
  return used >= MAX_AI_REFUNDS_PER_DAY ? null : { dayKey, count: used + 1 };
}
