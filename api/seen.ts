import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initFirebase, getUid } from './_lib/shared.js';

/**
 * Records that a signed-in person is on the site, so the admin panel can show
 * when each student was last here.
 *
 * The browser calls this when the site opens, when the student moves to
 * another page, and when a tab comes back into view (src/lib/seen.ts), at
 * most once per ten minutes and never on a timer. api/pre-check.ts and
 * api/check-practice.ts stamp the same field while they save anyway. The
 * body carries nothing and the only thing written is the clock.
 *
 * Firestore rules let a student change almost nothing on their own profile, so
 * the stamp is written here with the Admin SDK instead of from the browser.
 */
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

  try {
    // update(), not set(merge): a profile that does not exist yet is left
    // alone, so this can never create a half-built one that would stop
    // createUserProfile() writing the real thing.
    await getFirestore().collection('users').doc(uid).update({
      lastActiveAt: FieldValue.serverTimestamp(),
    });
  } catch (e: unknown) {
    // Still nothing worth showing a visitor an error over, but a stamp that
    // never lands leaves the admin panel quietly wrong, so it goes to the log
    // and the browser hears about it — src/lib/seen.ts then tries again on the
    // next visit instead of going quiet for ten minutes. A missing profile
    // (grpc NOT_FOUND) is the ordinary case and fixes itself once
    // createUserProfile() has run; anything else is a real problem.
    const code = (e as { code?: number | string }).code;
    const missing = code === 5 || code === 'not-found';
    if (missing) console.warn(`seen: ${uid} has no profile yet, nothing stamped`);
    else console.error(`seen: could not stamp ${uid}:`, e);
    return res.status(missing ? 404 : 500).json({ error: 'Not stamped.' });
  }
  return res.status(204).end();
}
