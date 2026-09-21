import { auth } from '@/firebase/firebase';

/**
 * Asks api/notify-teacher.ts to tag the chosen teacher in the teachers'
 * Telegram group. The review is already saved and paid for by the time this
 * runs, so it never throws and the caller does not need to wait for it.
 */
export async function notifyTeacher(reviewId: string): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch('/api/notify-teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reviewId }),
      // Lets the request finish even if the student leaves the page right away.
      keepalive: true,
    });
  } catch (e) {
    console.error('notifyTeacher failed:', e);
  }
}
