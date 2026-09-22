import { auth } from '@/firebase/firebase';

// Two visits a few minutes apart are the same visit for our purposes, and the
// admin panel reads both as "a while ago". Skipping the repeat keeps a refresh,
// or a second tab, from writing again. Kept per person, so someone else signing
// in on this computer is still stamped.
const QUIET_MS = 10 * 60_000;
const keyFor = (uid: string) => `lastSeenPing:${uid}`;

/**
 * Tells api/seen.ts that this person is on the site, so the admin panel can
 * show when each student was last here.
 *
 * Call it once when the site opens. It never throws and nothing waits for it:
 * a failed stamp only costs a slightly stale time in the admin panel.
 */
export async function markSeen(): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const key = keyFor(user.uid);
    if (Date.now() - Number(localStorage.getItem(key) ?? 0) < QUIET_MS) return;

    const token = await user.getIdToken();
    await fetch('/api/seen', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      // Lets the request finish even if they leave the page right away.
      keepalive: true,
    });
    localStorage.setItem(key, String(Date.now()));
  } catch (e) {
    console.error('markSeen failed:', e);
  }
}
