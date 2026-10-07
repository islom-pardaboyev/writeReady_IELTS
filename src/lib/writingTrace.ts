import { useCallback, useEffect, useRef, type ClipboardEvent } from 'react';

/**
 * How an essay came to be: how many characters were pasted into it and how
 * long the student spent writing. The admin sees it in the Telegram review
 * message when the essay is shared as a sample answer (api/_lib/samples),
 * so an essay pasted in whole from ChatGPT or a website is easy to spot.
 * It never blocks pasting and never keeps the pasted text, only its length.
 *
 * Counted in this browser while the student writes, one record per answer
 * box, and kept with the essay's fingerprint (a hash of its text), so the
 * feedback page can find it for the essay it shows. A record whose answer
 * box is emptied for a new essay moves to a short list of finished ones.
 * The browser reports it, so it is a hint for the reviewer, not proof.
 */

const LIVE = 'writeready.trace.live.';
const DONE = 'writeready.trace.done';
const KEEP_DONE = 20;
/** A pause longer than this is not writing time (a break, another tab). */
const MAX_GAP_MS = 30_000;

interface LiveRecord {
  v: 1;
  /** Characters pasted into this answer, in total. */
  pasted: number;
  /** Time between edits, pauses over MAX_GAP_MS left out. */
  activeMs: number;
  /** When the text last changed. */
  last: number;
  /** Fingerprint of the text as it stands. */
  hash: string;
  chars: number;
}

interface Finished {
  hash: string;
  pasted: number;
  activeMs: number;
  chars: number;
  at: number;
}

export interface WritingTrace {
  /** Characters pasted in, at most the essay's length. */
  pastedChars: number;
  /** The essay's length in characters. */
  chars: number;
  /** Writing time, in whole seconds. */
  activeSeconds: number;
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A 53-bit string hash (cyrb53): enough to tell one essay from another, not a secret. */
export function essayFingerprint(text: string): string {
  const s = normalize(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the essay simply has no writing record */
  }
}

function finish(record: LiveRecord): void {
  if (!record.chars) return;
  const list = (readJson<Finished[]>(DONE) ?? []).filter((f) => f.hash !== record.hash);
  list.unshift({ hash: record.hash, pasted: record.pasted, activeMs: record.activeMs, chars: record.chars, at: Date.now() });
  writeJson(DONE, list.slice(0, KEEP_DONE));
}

/**
 * Counts the writing in one answer box. `slot` tells the boxes of one page
 * apart (1 and 2 in a Mock). Spread `onPaste` on the textarea.
 */
export function useWritingTrace(page: string, slot: number, text: string): { onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void } {
  const key = `${LIVE}${page}.${slot}`;
  const record = useRef<LiveRecord | null>(null);

  const load = useCallback((): LiveRecord => {
    if (!record.current) {
      const saved = readJson<LiveRecord>(key);
      record.current = saved?.v === 1 ? saved : { v: 1, pasted: 0, activeMs: 0, last: 0, hash: '', chars: 0 };
    }
    return record.current;
  }, [key]);

  useEffect(() => {
    const r = load();
    const hash = text.trim() ? essayFingerprint(text) : '';
    if (hash === r.hash) return;
    if (!hash) {
      // Emptied for a new essay (or after it went for feedback): keep the old
      // essay's record where the feedback page can still find it, start afresh.
      finish(r);
      record.current = { v: 1, pasted: 0, activeMs: 0, last: 0, hash: '', chars: 0 };
      writeJson(key, record.current);
      return;
    }
    const now = Date.now();
    // A draft restored on load is not new writing: its gap is far too long to count.
    const gap = r.last ? now - r.last : MAX_GAP_MS + 1;
    if (gap <= MAX_GAP_MS) r.activeMs += gap;
    r.last = now;
    r.hash = hash;
    r.chars = normalize(text).length;
    writeJson(key, r);
  }, [text, key, load]);

  const onPaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const r = load();
    r.pasted += e.clipboardData.getData('text').length;
    writeJson(key, r);
  }, [key, load]);

  return { onPaste };
}

/** The writing record for this essay, if this browser wrote it. */
export function traceFor(essay: string): WritingTrace | null {
  const hash = essayFingerprint(essay);
  const found: { pasted: number; activeMs: number; chars: number } | undefined = (() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith(LIVE)) continue;
        const r = readJson<LiveRecord>(k);
        if (r?.v === 1 && r.hash === hash) return r;
      }
    } catch {
      return undefined;
    }
    return (readJson<Finished[]>(DONE) ?? []).find((f) => f.hash === hash);
  })();
  if (!found) return null;
  return {
    pastedChars: Math.min(found.pasted, found.chars),
    chars: found.chars,
    activeSeconds: Math.round(found.activeMs / 1000),
  };
}

/** Every writing record in this browser. Called on sign-out with the drafts. */
export function clearWritingTraces(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LIVE) || k === DONE) localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing was kept */
  }
}
