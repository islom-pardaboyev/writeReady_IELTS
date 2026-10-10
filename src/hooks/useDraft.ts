import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, type Firestore } from 'firebase/firestore';

/**
 * Keeps what a student is writing in this browser as they write, so the essay
 * survives the page being reloaded behind their back: a laptop waking from
 * sleep, a phone or browser freeing memory, a crash. useUnsavedWork cannot
 * help there, because the browser reloads such a page without asking.
 *
 * One draft per writing page and per account, in this browser only. It is
 * saved a moment after each change and at once when the page is hidden (which
 * is what closing a laptop does first). When signed in, the same essay is
 * also mirrored to Firestore every few seconds, so losing the browser itself
 * (a new device, a cleared cache) does not lose the essay too. The page
 * removes both copies when the essay goes for feedback (clear); signing out
 * removes every local draft (clearAllDrafts); one left for a week is dropped.
 */

const PREFIX = 'writeready.draft.';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const SAVE_DELAY_MS = 400;
const CLOUD_SYNC_MS = 5000;
const DRAFTS_COLLECTION = 'drafts';

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

/** Reads a draft left in Firestore for this page, newest-first, ignoring a stale or malformed one. */
async function readCloud<T>(db: Firestore, uid: string, page: string): Promise<Stored<T> | null> {
  const snap = await getDoc(doc(db, DRAFTS_COLLECTION, uid));
  const entry = snap.data()?.pages?.[page] as { value?: unknown; updatedAt?: { toMillis?: () => number } } | undefined;
  const savedAt = entry?.updatedAt?.toMillis?.();
  if (!entry || entry.value === undefined || typeof savedAt !== 'number' || Date.now() - savedAt > MAX_AGE_MS) return null;
  return { v: 1, savedAt, value: entry.value as T };
}

export interface DraftOptions<T> {
  /** Which writing page, e.g. 'mock'. */
  page: string;
  /** The signed-in student, so two accounts on one computer never see each other's drafts. */
  uid: string | null | undefined;
  /** When given, the draft is also mirrored to (and recovered from) Firestore for this student. */
  db?: Firestore;
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

export function useDraft<T>({ page, uid, db, value, ready, isEmpty, restore, shrink }: DraftOptions<T>) {
  const key = `${PREFIX}${page}.${uid ?? 'guest'}`;
  /** When the essay put back on the page was saved, or null when nothing was put back. */
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  /** When this device last wrote the current essay to disk, or null once it is cleared. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** True from a keystroke until it has been written, for a "Saving…" indicator. */
  const [pending, setPending] = useState(false);
  /** The saved draft has been looked at; from here on, changes are saved. */
  const [live, setLive] = useState(false);

  const latest = useRef(value);
  const cleared = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const lastCloudSnapshot = useRef<string | null>(null);
  const opts = useRef({ isEmpty, restore, shrink, db, uid });
  useEffect(() => {
    latest.current = value;
    opts.current = { isEmpty, restore, shrink, db, uid };
  });

  const save = useCallback(() => {
    window.clearTimeout(timer.current);
    if (cleared.current) return;
    const v = latest.current;
    if (opts.current.isEmpty(v)) {
      remove(key);
      setSavedAt(null);
    } else {
      write(key, v, opts.current.shrink);
      setSavedAt(Date.now());
    }
    setPending(false);
  }, [key]);

  // Mirrors the essay to Firestore a few seconds after it actually changes,
  // not on a fixed clock: Mock's exam timer ticks every second, and that
  // alone is not something worth a write.
  const syncCloud = useCallback(() => {
    if (cleared.current) return;
    const { db: cloudDb, uid: cloudUid, isEmpty: isEmptyFn, shrink: shrinkFn } = opts.current;
    if (!cloudDb || !cloudUid) return;
    const v = latest.current;
    if (isEmptyFn(v)) return;
    // The words, not whatever picture came with them (a Firestore document
    // tops out at 1MB, and the words are the part that cannot be redone).
    const cloudValue = shrinkFn ? shrinkFn(v) : v;
    const snapshot = JSON.stringify(cloudValue);
    if (snapshot === lastCloudSnapshot.current) return;
    lastCloudSnapshot.current = snapshot;
    setDoc(
      doc(cloudDb, DRAFTS_COLLECTION, cloudUid),
      { pages: { [page]: { value: cloudValue, updatedAt: serverTimestamp() } }, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((err) => {
      console.error('Could not back up the draft', err);
      lastCloudSnapshot.current = null; // try again next tick
    });
  }, [page]);

  // Look for a draft once the page is ready for one: this browser first (it
  // is faster and works offline), Firestore only when nothing was found here.
  useEffect(() => {
    if (!ready || live) return;
    let active = true;
    const settle = (saved: Stored<T> | null) => {
      if (!active) return;
      if (saved && !opts.current.isEmpty(saved.value)) {
        try {
          opts.current.restore(saved.value);
          setRestoredAt(saved.savedAt);
          setSavedAt(saved.savedAt);
        } catch {
          remove(key);
        }
      }
      setLive(true);
    };

    const local = read<T>(key);
    if (local) {
      settle(local);
      return;
    }
    const { db: cloudDb, uid: cloudUid } = opts.current;
    if (!cloudDb || !cloudUid) {
      settle(null);
      return;
    }
    readCloud<T>(cloudDb, cloudUid, page).then(settle, () => settle(null));
    return () => {
      active = false;
    };
  }, [ready, live, key, page]);

  // Save shortly after each change.
  useEffect(() => {
    if (!live) return;
    cleared.current = false;
    setPending(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  }, [value, live, save]);

  // A slower, best-effort heartbeat for the Firestore copy.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(syncCloud, CLOUD_SYNC_MS);
    return () => window.clearInterval(id);
  }, [live, syncCloud]);

  // Save at once when the page is hidden or closed, and when the student leaves the page.
  useEffect(() => {
    if (!live) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        save();
        syncCloud();
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', syncCloud);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', syncCloud);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [live, save, syncCloud]);

  /** The essay went for feedback, or the student started over: forget the draft, here and in Firestore. */
  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    cleared.current = true;
    lastCloudSnapshot.current = null;
    remove(key);
    setRestoredAt(null);
    setSavedAt(null);
    setPending(false);
    const { db: cloudDb, uid: cloudUid } = opts.current;
    if (cloudDb && cloudUid) {
      updateDoc(doc(cloudDb, DRAFTS_COLLECTION, cloudUid), { [`pages.${page}`]: deleteField() }).catch(() => {
        /* nothing saved there, or the document never existed: nothing to remove */
      });
    }
  }, [key, page]);

  const dismiss = useCallback(() => setRestoredAt(null), []);

  return { restoredAt, savedAt, pending, clear, dismiss };
}
