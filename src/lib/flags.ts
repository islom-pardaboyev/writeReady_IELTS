import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';

/**
 * config/featureFlags, read once and shared. A writing page asked for it up to
 * five times (the Human Check flag, its price and fee, the prompts version in
 * src/lib/promptCache.ts, and the score test in src/lib/scoreTest.ts), one
 * Firestore read each. Now the first
 * ask reads it and the rest reuse that for a few minutes. Kept per database,
 * because the admin panel signs in on its own one (adminDb).
 */
const FLAGS_MAX_AGE = 5 * 60 * 1000;
const flagsCache = new WeakMap<Firestore, { at: number; data: Promise<Record<string, unknown>> }>();

export function loadFlags(dbInstance: Firestore): Promise<Record<string, unknown>> {
  const hit = flagsCache.get(dbInstance);
  if (hit && Date.now() - hit.at < FLAGS_MAX_AGE) return hit.data;
  const data = getDoc(doc(dbInstance, 'config', 'featureFlags')).then((snap) => (snap.exists() ? snap.data() : {}));
  // A failed read is not remembered: the next ask tries again.
  data.catch(() => {
    if (flagsCache.get(dbInstance)?.data === data) flagsCache.delete(dbInstance);
  });
  flagsCache.set(dbInstance, { at: Date.now(), data });
  return data;
}

export async function writeFlags(dbInstance: Firestore, patch: Record<string, unknown>): Promise<void> {
  await setDoc(doc(dbInstance, 'config', 'featureFlags'), patch, { merge: true });
  flagsCache.delete(dbInstance);
}
