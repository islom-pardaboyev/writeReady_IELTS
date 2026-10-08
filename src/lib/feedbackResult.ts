import type { CategoryFeedback, EnhancedFeedbackCategories, EnhancedFeedbackResult, GrammarPoint } from "@/types";
import { CRITERIA, liftReportFields, normalizeScores } from "@shared/bandScore";

// The model's report JSON turned into what the feedback page and its PDF
// show. Shared by src/pages/FeedbackPage.tsx and the dashboard's PDF download.

/**
 * A report as the feedback page shows it, built from the model's JSON. The scores go
 * through the same rules the server used before saving (api/_lib/bandScore.ts),
 * so the band on screen is the band in the student's history. Before, the page
 * showed the model's own sum for the overall band, which could differ from the
 * saved one.
 *
 * Null when there are no real scores. The server refunds exactly those
 * reports, so the page can say "you were not charged" and mean it. Missing
 * lists become empty ones, so a short reply can never crash a tab.
 */
export function toFeedbackResult(parsed: unknown, limited: boolean, taskType: 'Task 1' | 'Task 2'): EnhancedFeedbackResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  // A section a stray bracket left in the wrong place, put back the same way
  // the server does before it decides whether the report counts.
  liftReportFields(p);
  const scores = normalizeScores(p.scores);
  if (!scores) return null;
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const strings = (v: unknown) => list<unknown>(v).filter((x): x is string => typeof x === 'string');

  // Only the categories the model wrote, each with both lists present. The
  // score-only free report has none, and shows none.
  const rawCategories = (p.feedback && typeof p.feedback === 'object' ? p.feedback : {}) as Record<string, Partial<CategoryFeedback> | undefined>;
  const feedback = Object.fromEntries(
    CRITERIA.filter((k) => rawCategories[k]).map((k) => [k, {
      strengths: strings(rawCategories[k]?.strengths),
      issues: strings(rawCategories[k]?.issues),
    }]),
  ) as unknown as EnhancedFeedbackCategories;

  const rawReadability = (p.readability && typeof p.readability === 'object' ? p.readability : {}) as Record<string, unknown>;
  const tips = list<Record<string, unknown>>(rawReadability.tips)
    .map((t) => ({ problem: text(t?.problem), original: text(t?.original), clearer: text(t?.clearer) }))
    .filter((t) => t.problem && t.clearer);

  // `kind` and `yours` are newer fields: kept only when they are what the page
  // expects, so an older or odd reply still shows as a plain grammar point.
  const grammar = list<Record<string, unknown>>(p.grammar)
    .filter((g) => g && typeof g === 'object')
    .map((g): GrammarPoint => {
      const yours = text(g.yours).trim();
      return {
        point: text(g.point),
        explanation: text(g.explanation),
        example: text(g.example),
        ...(g.kind === 'mistake' || g.kind === 'add' ? { kind: g.kind } : {}),
        ...(yours ? { yours } : {}),
      };
    })
    .filter((g) => g.point);

  return {
    taskType,
    topic: text(p.topic) || 'General',
    wordCount: typeof p.wordCount === 'number' ? p.wordCount : 0,
    scores,
    feedback,
    priorityFixes: strings(p.priorityFixes),
    readability: tips.length ? { summary: text(rawReadability.summary), tips } : undefined,
    bandGapAnalysis: text(p.bandGapAnalysis),
    sampleResponse: text(p.sampleResponse),
    sentenceAnalysis: list(p.sentenceAnalysis),
    vocabulary: list(p.vocabulary),
    grammar,
    limited,
  };
}

/** Lower case, no quote marks, plain dashes, single spaces: enough to find a quote in a sentence. */
export const looseText = (t: string | null | undefined) =>
  (t ?? '').toLowerCase().replace(/[“”"'‘’]/g, '').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/\s+/g, ' ').trim();

/**
 * Hides a quote the AI says it copied from the essay but did not. It is told
 * to copy exactly, yet it sometimes fixes a word on the way, and a "Your
 * version" the student never wrote would only confuse them. The fix itself
 * stays: a grammar point falls back to a plain example, a readability tip to
 * its easier version.
 */
export function withRealQuotes(result: EnhancedFeedbackResult, essay: string): EnhancedFeedbackResult {
  const text = looseText(essay);
  if (!text) return result; // nothing to check against
  const inEssay = (quote: string) => text.includes(looseText(quote));
  const grammar = (result.grammar ?? []).map((g) => {
    if (!g.yours || inEssay(g.yours)) return g;
    const plain = { ...g };
    delete plain.yours;
    return plain;
  });
  const readability = result.readability && {
    ...result.readability,
    tips: result.readability.tips.map((t) => (t.original && !inEssay(t.original) ? { ...t, original: '' } : t)),
  };
  return { ...result, grammar, readability };
}
