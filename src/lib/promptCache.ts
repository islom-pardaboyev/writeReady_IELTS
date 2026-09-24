import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from "firebase/firestore";

/**
 * The writing prompts, kept in the browser between visits.
 *
 * Mock, Practice and Quick each need every Task 1 and Task 2 prompt to fill
 * their shuffle bags. Downloading both collections on every visit cost one
 * Firestore read per prompt per visit, which was most of the site's daily
 * reads (the Spark plan allows 50,000 a day, then stops serving). Now a visit
 * reads one small number, `promptsVersion` on config/featureFlags, and
 * downloads the prompts again only when the admin has changed them since.
 * A repeat visit is also faster: the list comes from the phone, not the network.
 *
 * Only the id and the question are kept, because that is all the writing
 * pages use. The thumbnail on each Task 1 prompt is for the admin list, so it
 * stays out of the browser, and out of the report links built from a prompt.
 */

export interface PromptItem {
  id: string;
  report: string;
}

export interface PromptLists {
  task1: PromptItem[];
  task2: PromptItem[];
}

const KEY = "writeready.prompts.v1";
/** No version set yet (the admin has not changed a prompt since this shipped): trust a saved copy for a day. */
const UNVERSIONED_MAX_AGE = 24 * 60 * 60 * 1000;
/** Even with a matching version, fetch again after a week, in case a change was made some other way. */
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

interface Saved extends PromptLists {
  version: string | null;
  savedAt: number;
}

const isList = (v: unknown): v is PromptItem[] =>
  Array.isArray(v) && v.every((p) => p && typeof p.id === "string" && typeof p.report === "string");

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Saved>;
    if (!isList(s.task1) || !isList(s.task2) || typeof s.savedAt !== "number") return null;
    return { task1: s.task1, task2: s.task2, savedAt: s.savedAt, version: typeof s.version === "string" ? s.version : null };
  } catch {
    // Private window, blocked storage, or a damaged entry: fetch as if new.
    return null;
  }
}

function writeSaved(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage full or blocked: the next visit fetches again, as before */
  }
}

/** Where the prompts come from. scripts/test-prompt-cache.ts passes a stand-in. */
export interface PromptSource {
  /** The current version: a string, null when none is set, undefined when it could not be read. */
  version(): Promise<string | null | undefined>;
  fetchAll(): Promise<PromptLists>;
}

function firestoreSource(db: Firestore): PromptSource {
  return {
    async version() {
      try {
        const snap = await getDoc(doc(db, "config", "featureFlags"));
        const v = snap.exists() ? snap.data().promptsVersion : undefined;
        return typeof v === "string" || typeof v === "number" ? String(v) : null;
      } catch {
        return undefined;
      }
    },
    async fetchAll() {
      const [t1, t2] = await Promise.all([
        getDocs(collection(db, "task1_reports")),
        getDocs(collection(db, "task2_reports")),
      ]);
      const pick = (docs: typeof t1.docs) =>
        docs.flatMap((d) => {
          const report = d.data().report;
          return typeof report === "string" && report.trim() ? [{ id: d.id, report }] : [];
        });
      return { task1: pick(t1.docs), task2: pick(t2.docs) };
    },
  };
}

export function loadPrompts(db: Firestore): Promise<PromptLists> {
  return loadPromptsFrom(firestoreSource(db));
}

export async function loadPromptsFrom(source: PromptSource): Promise<PromptLists> {
  const saved = readSaved();
  const version = await source.version();
  if (saved) {
    const age = Date.now() - saved.savedAt;
    const current =
      version === undefined
        ? age < MAX_AGE
        : version === null
          ? saved.version === null && age < UNVERSIONED_MAX_AGE
          : saved.version === version && age < MAX_AGE;
    if (current) return { task1: saved.task1, task2: saved.task2 };
  }

  try {
    const lists = await source.fetchAll();
    writeSaved({ ...lists, version: version ?? null, savedAt: Date.now() });
    return lists;
  } catch (err) {
    // Offline, or the database refused (for example the day's read quota ran
    // out): an older copy of the prompts beats an empty page.
    if (saved) return { task1: saved.task1, task2: saved.task2 };
    throw err;
  }
}

/**
 * Marks the prompts as changed, so every student's saved copy is replaced on
 * their next visit. The admin calls it after adding, editing or deleting one.
 */
export async function bumpPromptsVersion(db: Firestore): Promise<void> {
  await setDoc(doc(db, "config", "featureFlags"), { promptsVersion: String(Date.now()) }, { merge: true });
}
