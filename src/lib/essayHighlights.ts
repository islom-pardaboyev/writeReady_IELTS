import type { PublicVocab } from './questionData';

/**
 * Marks a sample essay's own vocabulary words and grammar notes inline, so a
 * reader can hover (or focus) a highlighted word or phrase and see what it
 * means, without leaving the essay. Used only for the one sample whose notes
 * these are (scripts/lib/questionSite.tsx picks the AI-reviewed answer's
 * notes first, the student's own otherwise) — never guessed for a different
 * essay, since the quoted phrases belong to one specific piece of writing.
 *
 * No imports beyond a type: this runs in the browser and at build time
 * (scripts/lib/questionSite.tsx), same as questionData.ts.
 */

export type EssaySegment =
  | { type: 'text'; text: string }
  | { type: 'vocab'; text: string; vocab: PublicVocab }
  | { type: 'grammar'; text: string; note: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The phrase a grammar note quotes from the essay, e.g. `...uses "which is" well` -> "which is". */
function quotedPhrase(note: string): string | null {
  const m = /[“"']([^“”"']{3,140})[”"']/.exec(note);
  const phrase = m?.[1]?.trim();
  return phrase && phrase.length >= 3 ? phrase : null;
}

/** Finds `phrase` in `text` (case-insensitive), tolerating different whitespace between its words. */
function findPhrase(text: string, phrase: string): { start: number; end: number } | null {
  const lower = text.toLowerCase();
  const target = phrase.toLowerCase();
  const direct = lower.indexOf(target);
  if (direct >= 0) return { start: direct, end: direct + phrase.length };
  const words = target.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (words.length < 2) return null;
  const m = new RegExp(words.join('\\s+'), 'i').exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

interface Range { start: number; end: number; type: 'vocab' | 'grammar'; vocab?: PublicVocab; note?: string }

const overlaps = (a: { start: number; end: number }, start: number, end: number) => start < a.end && end > a.start;

/**
 * The essay as a list of plain-text, vocabulary and grammar segments: the
 * first occurrence of each vocabulary word, and of each grammar note's quoted
 * phrase, in reading order. A grammar phrase wins over a vocabulary word it
 * overlaps (it is tried first); a note with nothing quoted, or a word the
 * essay never uses, is simply left out.
 */
export function buildEssayHighlights(text: string, vocabulary: PublicVocab[], grammarHighlights: string[]): EssaySegment[] {
  const ranges: Range[] = [];

  for (const note of grammarHighlights) {
    const phrase = quotedPhrase(note);
    if (!phrase) continue;
    const found = findPhrase(text, phrase);
    if (!found || ranges.some((r) => overlaps(r, found.start, found.end))) continue;
    ranges.push({ ...found, type: 'grammar', note });
  }

  for (const v of [...vocabulary].sort((a, b) => b.word.length - a.word.length)) {
    const m = new RegExp(`\\b${escapeRegExp(v.word)}\\b`, 'i').exec(text);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (ranges.some((r) => overlaps(r, start, end))) continue;
    ranges.push({ start, end, type: 'vocab', vocab: v });
  }

  ranges.sort((a, b) => a.start - b.start);

  const segments: EssaySegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) segments.push({ type: 'text', text: text.slice(cursor, r.start) });
    segments.push(
      r.type === 'vocab'
        ? { type: 'vocab', text: text.slice(r.start, r.end), vocab: r.vocab! }
        : { type: 'grammar', text: text.slice(r.start, r.end), note: r.note! },
    );
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}

/** The essay's paragraphs (split on blank lines, like a plain render would), each as highlighted segments. */
export function paragraphSegments(text: string, vocabulary: PublicVocab[], grammarHighlights: string[]): EssaySegment[][] {
  const segments = buildEssayHighlights(text, vocabulary, grammarHighlights);
  const paragraphs: EssaySegment[][] = [[]];
  for (const seg of segments) {
    if (seg.type !== 'text') {
      paragraphs[paragraphs.length - 1].push(seg);
      continue;
    }
    seg.text.split(/\n+/).forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part) paragraphs[paragraphs.length - 1].push({ type: 'text', text: part });
    });
  }
  return paragraphs
    .map((p) => {
      if (!p.length) return p;
      const out = [...p];
      const first = out[0];
      const last = out[out.length - 1];
      if (first.type === 'text') out[0] = { ...first, text: first.text.replace(/^\s+/, '') };
      if (last.type === 'text') out[out.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') };
      return out;
    })
    .filter((p) => p.some((s) => s.text.trim() !== ''));
}
