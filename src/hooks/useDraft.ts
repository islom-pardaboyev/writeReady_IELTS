import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps what a student is writing in this browser as they write, so the essay
 * survives the page being reloaded behind their back: a laptop waking from
 * sleep, a phone or browser freeing memory, a crash. useUnsavedWork cannot
 * help there, because the browser reloads such a page without asking.
 *
 * One draft per writing page and per account, in this browser only. It is
 * saved a moment after each change and at once when the page is hidden (which
 * is what closing a laptop does first). The page removes it when the essay
 * goes for feedback (clear); signing out removes them all (clearAllDrafts);
 * one left for a week is dropped.
 */

const PREFIX = 'writeready.draft.';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const SAVE_DELAY_MS = 400;

interface Stored<T> {
  v: 1;
  savedAt: number;
  value: T;
}

/** Every draft in this browser. Called on sign-out, so the next person on this computer sees none. */
export function clearAllDrafts(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    /* storage blocked: there is nothing saved either */
  }
}

function read<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<T>;
    if (stored?.v !== 1 || typeof stored.savedAt !== 'number' || Date.now() - stored.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T, shrink?: (value: T) => T): void {
  const put = (v: T) => localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: Date.now(), value: v } satisfies Stored<T>));
  try {
    put(value);
  } catch {
    // Storage full (a big picture, usually): keep the words at least.
    try {
      if (shrink) put(shrink(value));
    } catch {
      /* blocked or still full: the page works as before, just unsaved */
    }
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

export interface DraftOptions<T> {
  /** Which writing page, e.g. 'mock'. */
  page: string;
  /** The signed-in student, so two accounts on one computer never see each other's drafts. */
  uid: string | null | undefined;
  /** What to keep. Pass a memoised object: it is saved whenever it changes. */
  value: T;
  /** False until the page has loaded what a draft goes back into (its prompts). */
  ready: boolean;
  isEmpty: (value: T) => boolean;
  /** Puts a saved draft back on the page. Check its fields: storage can hold anything. */
  restore: (saved: T) => void;
  /** A smaller copy to keep when the browser's storage is full, e.g. without a picture. */
  shrink?: (value: T) => T;
}

export function useDraft<T>({ page, uid, value, ready, isEmpty, restore, shrink }: DraftOptions<T>) {
  const key = `${PREFIX}${page}.${uid ?? 'guest'}`;
  /** When the essay put back on the page was saved, or null when nothing was put back. */
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  /** The saved draft has been looked at; from here on, changes are saved. */
  const [live, setLive] = useState(false);

  const latest = useRef(value);
  const cleared = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const fns = useRef({ isEmpty, restore, shrink });
  useEffect(() => {
    latest.current = value;
    fns.current = { isEmpty, restore, shrink };
  });

  const save = useCallback(() => {
    window.clearTimeout(timer.current);
    if (cleared.current) return;
    const v = latest.current;
    if (fns.current.isEmpty(v)) remove(key);
    else write(key, v, fns.current.shrink);
  }, [key]);

  // Look for a draft once the page is ready for one.
  useEffect(() => {
    if (!ready || live) return;
    const saved = read<T>(key);
    if (saved && !fns.current.isEmpty(saved.value)) {
      try {
        fns.current.restore(saved.value);
        setRestoredAt(saved.savedAt);
      } catch {
        remove(key);
      }
    }
    setLive(true);
  }, [ready, live, key]);

  // Save shortly after each change.
  useEffect(() => {
    if (!live) return;
    cleared.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  }, [value, live, save]);

  // Save at once when the page is hidden or closed, and when the student leaves the page.
  useEffect(() => {
    if (!live) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [live, save]);

  /** The essay went for feedback, or the student started over: forget the draft. */
  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    cleared.current = true;
    remove(key);
    setRestoredAt(null);
  }, [key]);

  const dismiss = useCallback(() => setRestoredAt(null), []);

  return { restoredAt, clear, dismiss };
}
