/**
 * What the visitor has been told, and agreed to, about browser storage.
 *
 * Today WriteReady stores only what it needs to work: the Firebase sign-in
 * session, your theme, your shortcuts and which announcements you have seen.
 * Storage like that is exempt from consent under the EU e-Privacy rules and
 * their equivalents, so the banner tells you about it and asks nothing more.
 *
 * The moment anything non-essential is added — analytics, ads, a heatmap, an
 * embedded pixel — flip HAS_NON_ESSENTIAL_STORAGE to true. The banner then
 * asks a real question with a real "no", and whatever you added must wait for
 * `analyticsAllowed()` before it loads. Loading a tracker before that is what
 * turns a cookie banner into a fine.
 */
const KEY = 'cookieNotice.v1';

export const HAS_NON_ESSENTIAL_STORAGE = false;

export type ConsentChoice = 'essential' | 'all';

export function readConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'essential' || raw === 'all' ? raw : null;
  } catch {
    // Private window, or storage blocked. Treat it as "not asked yet"; the
    // banner will show again, which is the safe way round.
    return null;
  }
}

export function saveConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* nothing to remember it with — the banner reappears next time */
  }
}

/** Gate every future analytics or advertising script behind this. */
export function analyticsAllowed(): boolean {
  if (!HAS_NON_ESSENTIAL_STORAGE) return false;
  return readConsent() === 'all';
}
