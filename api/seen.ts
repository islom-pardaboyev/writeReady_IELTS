import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initFirebase, getUid } from './_lib/shared.js';

/**
 * Records that a signed-in person is on the site, so the admin panel can show
 * when each student was last here.
 *
 * The browser calls this once when it opens (see src/lib/seen.ts), not on a
 * timer. Visiting is the whole signal: it does not matter what they do next,
 * so the body carries nothing and the only thing written is the clock.
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
  } catch {
    // No profile yet, or Firestore is having a moment. Nothing here is worth
    // showing a visitor an error over.
  }
  return res.status(204).end();
}
