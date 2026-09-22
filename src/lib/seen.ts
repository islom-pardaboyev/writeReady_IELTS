import { auth } from '@/firebase/firebase';

// Two visits a few minutes apart are the same visit for our purposes, and the
// admin panel reads both as "a while ago". Skipping the repeat keeps a refresh,
// or a second tab, from writing again. Kept per person, so someone else signing
// in on this computer is still stamped.
const QUIET_MS = 10 * 60_000;
const keyFor = (uid: string) => `lastSeenPing:${uid}`;

// Private browsing can refuse storage outright. Losing the note only costs one
// extra request, so it must never be the thing that stops the stamp.
function lastPing(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

function rememberPing(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Nothing to do: the next visit simply stamps again.
  }
}

// One request at a time. Two tabs waking together, or a tab coming back into
// view while the first request is still open, would otherwise both send.
let sending = false;

/**
 * Tells api/seen.ts that this person is on the site, so the admin panel can
 * show when each student was last here.
 *
 * Nothing waits for it and it never throws: a failed stamp only costs a stale
 * time in the admin panel. It does say so in the console, and leaves the
 * quiet-window note alone, so the next visit tries again — a stamp that
 * silently never lands leaves the admin panel quietly wrong.
 */
export async function markSeen(): Promise<void> {
  if (sending) return;
  const user = auth.currentUser;
  if (!user) return;

  const key = keyFor(user.uid);
  if (Date.now() - lastPing(key) < QUIET_MS) return;

  sending = true;
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/seen', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      // Lets the request finish even if they leave the page right away.
      keepalive: true,
      // A request that never settles would leave `sending` stuck and stop
      // every later stamp on this page. Browsers without timeout() just wait.
      signal: AbortSignal.timeout?.(10_000),
    });
    if (res.ok) rememberPing(key);
    else console.error(`markSeen: /api/seen answered ${res.status}`);
  } catch (e) {
    console.error('markSeen failed:', e);
  } finally {
    sending = false;
  }
}

/**
 * Stamps again when a tab that was left open comes back into view, so someone
 * who keeps the site open for days is not filed under the day they opened it.
 * Returns the unsubscribe function.
 *
 * This is not a poll. It runs on the browser's own visibility event, and the
 * quiet window above caps it at one request every ten minutes.
 */
export function watchSeen(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void markSeen();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}
