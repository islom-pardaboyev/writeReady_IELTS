import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initFirebase, getUid } from './_lib/shared.js';
import { buildTeacherNotice } from './_lib/teacherNotice.js';

/**
 * Tells the teachers' private Telegram group that a student has picked a
 * teacher for a Human Check, tagging that teacher by their Telegram username.
 *
 * The browser only sends a review id. Everything in the message comes from the
 * saved review, and the caller must be the student who owns it, so nobody can
 * use this endpoint to post their own text into the group. Each review is
 * announced once.
 */

const TELEGRAM_LIMIT = 4096; // Telegram rejects anything longer

async function sendToTeachersGroup(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_TEACHERS_CHAT_ID;
  if (!token || !chatId) {
    console.error('notify-teacher: TELEGRAM_TOKEN or TELEGRAM_TEACHERS_CHAT_ID is not set');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html.length > TELEGRAM_LIMIT ? `${html.slice(0, TELEGRAM_LIMIT - 1)}…` : html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error('notify-teacher: Telegram rejected the message:', await res.text());
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Please sign in.' });
  }

  const reviewId = (req.body ?? {}).reviewId;
  if (typeof reviewId !== 'string' || !reviewId || reviewId.includes('/')) {
    return res.status(400).json({ error: 'reviewId is required.' });
  }

  const db = getFirestore();
  const reviewRef = db.collection('humanReviews').doc(reviewId);

  // Claim the review first, so two quick calls cannot post it twice.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reviewRef);
    if (!snap.exists) return { result: 'missing' as const };
    const review = snap.data()!;
    if (review.uid !== uid) return { result: 'forbidden' as const };
    if (review.status !== 'pending' || review.teacherNotifiedAt) return { result: 'already' as const };
    tx.update(reviewRef, { teacherNotifiedAt: FieldValue.serverTimestamp() });
    return { result: 'claimed' as const, review };
  });

  if (claim.result === 'missing') return res.status(404).json({ error: 'Review not found.' });
  if (claim.result === 'forbidden') return res.status(403).json({ error: 'Not your review.' });
  if (claim.result === 'already') return res.status(200).json({ ok: true, alreadySent: true });

  const { review } = claim;
  try {
    const teacher = await db.collection('teachers').doc(String(review.teacherId)).get();
    const sent = await sendToTeachersGroup(buildTeacherNotice({
      teacherName: String(review.teacherName ?? teacher.data()?.name ?? 'Teacher'),
      telegram: teacher.data()?.telegram,
      studentName: String(review.studentName ?? ''),
      task1: review.task1,
      task2: review.task2,
    }));
    if (!sent) throw new Error('Telegram did not accept the message.');
  } catch (e) {
    console.error('notify-teacher: could not notify for review', reviewId, e);
    // Release the claim so the notice can be sent again.
    await reviewRef.update({ teacherNotifiedAt: FieldValue.delete() }).catch(() => {});
    return res.status(502).json({ error: 'Could not reach the teachers group.' });
  }

  return res.status(200).json({ ok: true });
}
