import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initFirebase, getUid } from '../shared.js';

/**
 * A student's own profile photo (src/components/profile/PhotoEditor.tsx).
 *
 *   POST { photo }    saves it: a square data URL the browser already cropped
 *                     and shrank (src/lib/profilePhoto.ts)
 *   POST { remove }   deletes it
 *
 * The photo lives in profile_photos/{uid}, like teacher photos and Task 1
 * charts, so the user document everyone reads stays small. The profile only
 * carries `photoVersion`, which tells the site there is a photo and when it
 * changed. Students cannot write either themselves (firestore.rules), so the
 * file is checked here: a real JPEG, PNG or WebP, and small.
 *
 * The 2 MB limit students see applies to the file they choose; the browser
 * makes a 400px copy of well under MAX_BYTES before it gets here.
 */

const MAX_BYTES = 300_000;

const TYPES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** The photo as it may be stored, or null when it is not a small real image. */
function validPhoto(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_BYTES * 1.4) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES || !TYPES[m[1]](bytes)) return null;
  return raw;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch {
    return res.status(500).json({ error: 'Photos cannot be saved right now. Please try again shortly.' });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const photoRef = db.collection('profile_photos').doc(uid);
  const { photo, remove } = (req.body ?? {}) as { photo?: unknown; remove?: unknown };

  try {
    if (!(await userRef.get()).exists) return res.status(404).json({ error: 'Your profile was not found.' });

    if (remove === true) {
      const batch = db.batch();
      batch.delete(photoRef);
      batch.update(userRef, { photoVersion: FieldValue.delete() });
      await batch.commit();
      return res.status(200).json({ photoVersion: null });
    }

    const valid = validPhoto(photo);
    if (!valid) return res.status(400).json({ error: 'That photo could not be used. Choose a JPG, PNG or WebP image.' });

    const photoVersion = Date.now();
    const batch = db.batch();
    batch.set(photoRef, { photo: valid, updatedAt: FieldValue.serverTimestamp() });
    batch.update(userRef, { photoVersion });
    await batch.commit();
    return res.status(200).json({ photoVersion });
  } catch (e) {
    console.error(`profile-photo: could not save for ${uid}:`, e);
    return res.status(503).json({ error: 'Your photo could not be saved. Please try again.' });
  }
}
