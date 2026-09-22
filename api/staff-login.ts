import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'crypto';
import { initFirebase } from './_lib/shared.js';

// Server-side credential check for the admin / learning-center / teacher
// panels, which all live on the isolated `admin-panel` secondary Firebase
// app (see src/firebase/adminConfig.ts). Previously these logins were
// verified entirely in the browser: the admin login/password came from a
// VITE_-prefixed env var (inlined into the shipped JS bundle, readable by
// anyone), and the center/teacher checks fetched a plaintext `password`
// field from Firestore into the client to compare there — and the "session"
// each then signed into used a password *deterministically derived from the
// document's public ID* (e.g. `CENTER_${centerId}_internal`), so anyone who
// could see a center/teacher ID could sign in as that account without ever
// knowing the real password. This endpoint verifies credentials with the
// Admin SDK (which never leaves the server) and mints a short-lived custom
// token for the *existing* Firebase Auth uid tied to each role's fixed
// internal email, so the client never sees a password or a derivable one.

const ADMIN_FB_EMAIL = 'admin@writeready.internal';
const CENTER_FB_PREFIX = 'center_';
const TEACHER_FB_PREFIX = 'teacher_';

// Look up the Firebase Auth account for a fixed internal email (creating it
// with a random, never-reused password if it doesn't exist yet) and return a
// fresh custom token for its uid. Looking the uid up by email — rather than
// choosing one ourselves — means any existing Firestore rules keyed on that
// uid/email keep working exactly as before.
async function mintCustomTokenForEmail(email: string): Promise<string> {
  const auth = getAuth();
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    uid = (await auth.createUser({ email, password: randomBytes(32).toString('hex') })).uid;
  }
  return auth.createCustomToken(uid);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  const { role, login, password } = req.body ?? {};
  if (typeof login !== 'string' || typeof password !== 'string' || !login.trim() || !password) {
    return res.status(400).json({ error: 'login and password are required.' });
  }
  const trimmedLogin = login.trim();
  const db = getFirestore();

  // The main /admin screen has one combined login form that tries admin
  // credentials, then falls back to a learning-center login — so when no
  // `role` is given we mirror that by trying both in order.
  if (!role || role === 'admin') {
    const adminLogin = process.env.ADMIN_LOGIN;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminLogin && adminPassword && trimmedLogin === adminLogin && password === adminPassword) {
      const customToken = await mintCustomTokenForEmail(ADMIN_FB_EMAIL);
      return res.status(200).json({ role: 'admin', customToken });
    }
    if (role === 'admin') return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  if (!role || role === 'center') {
    const snap = await db.collection('learningCenters').where('login', '==', trimmedLogin).limit(1).get();
    if (snap.empty) {
      if (role === 'center') return res.status(401).json({ error: 'Center not found.' });
    } else {
      const centerDoc = snap.docs[0];
      const data = centerDoc.data();
      if (data.password !== password) {
        if (role === 'center') return res.status(401).json({ error: 'Incorrect password.' });
      } else {
        const customToken = await mintCustomTokenForEmail(`${CENTER_FB_PREFIX}${centerDoc.id}@writeready.internal`);
        return res.status(200).json({ role: 'center', customToken, centerId: centerDoc.id, centerName: data.name ?? 'Center' });
      }
    }
  }

  if (role === 'teacher') {
    const snap = await db.collection('teachers').where('login', '==', trimmedLogin).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: 'Incorrect login or password.' });
    const teacherDoc = snap.docs[0];
    const data = teacherDoc.data();
    if (data.password !== password) return res.status(401).json({ error: 'Incorrect login or password.' });
    if (data.active === false) return res.status(403).json({ error: 'This account is inactive. Please contact the admin.' });
    const customToken = await mintCustomTokenForEmail(`${TEACHER_FB_PREFIX}${teacherDoc.id}@writeready.internal`);
    return res.status(200).json({ role: 'teacher', customToken, teacherId: teacherDoc.id, teacherName: data.name ?? 'Teacher' });
  }

  return res.status(401).json({ error: 'Incorrect login or password.' });
}
