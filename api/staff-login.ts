import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { initFirebase } from './_lib/shared.js';

// Server-side credential check for the admin / learning-center / teacher
// panels, which all live on the isolated `admin-panel` secondary Firebase
// app (see src/firebase/adminConfig.ts). Credentials are checked here with
// the Admin SDK, which never leaves the server, and the caller gets a
// short-lived custom token for the Firebase Auth account tied to each role's
// fixed internal email. The browser never sees a stored password.
//
// Teacher logins live in `teacherAuth`, which no browser can read. The public
// `teachers` profiles are readable by every student, and logins used to be
// stored there.

const ADMIN_FB_EMAIL = 'admin@writeready.internal';
const CENTER_FB_PREFIX = 'center_';
const TEACHER_FB_PREFIX = 'teacher_';

// Wrong passwords allowed per IP address before sign-in is paused. Staff sign
// in rarely, so this never gets in their way, but it turns guessing the admin
// password into years of work instead of an afternoon.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

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

/** Compares two secrets in constant time, so response timing leaks nothing. */
function sameSecret(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string' || !stored) return false;
  const a = createHash('sha256').update(stored).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

function clientKey(req: VercelRequest): string {
  const ip = String(req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  // Hashed, so no raw address is stored.
  return `ip_${createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 24)}`;
}

async function isLockedOut(key: string): Promise<boolean> {
  const d = (await getFirestore().collection('login_limits').doc(key).get()).data();
  return !!d && Date.now() - Number(d.windowStart) < FAILURE_WINDOW_MS && Number(d.count) >= MAX_FAILURES;
}

async function recordFailure(key: string): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('login_limits').doc(key);
  await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    const fresh = !d || Date.now() - Number(d.windowStart) >= FAILURE_WINDOW_MS;
    tx.set(ref, fresh ? { windowStart: Date.now(), count: 1 } : { windowStart: d.windowStart, count: Number(d.count) + 1 });
  });
}

/** The teacher with this login, from teacherAuth, or from an old public profile. */
async function findTeacherLogin(login: string) {
  const db = getFirestore();
  const auth = await db.collection('teacherAuth').where('login', '==', login).limit(1).get();
  if (!auth.empty) return { teacherId: auth.docs[0].id, password: auth.docs[0].data().password, legacy: false };
  const legacy = await db.collection('teachers').where('login', '==', login).limit(1).get();
  if (!legacy.empty) return { teacherId: legacy.docs[0].id, password: legacy.docs[0].data().password, legacy: true };
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    console.error('staff-login: Firebase init failed:', e);
    return res.status(500).json({ error: 'The sign-in service could not start. Try again in a minute.' });
  }

  const { role, login, password } = req.body ?? {};
  if (typeof login !== 'string' || typeof password !== 'string' || !login.trim() || !password) {
    return res.status(400).json({ error: 'login and password are required.' });
  }
  const trimmedLogin = login.trim();
  const db = getFirestore();

  const key = clientKey(req);
  try {
    if (await isLockedOut(key)) {
      return res.status(429).json({ error: 'Too many wrong passwords. Wait 15 minutes and try again.' });
    }
  } catch (e) {
    console.error('staff-login: rate-limit check failed, letting it through:', e);
  }

  const fail = async (status: number, error: string) => {
    await recordFailure(key).catch((e) => console.error('staff-login: could not record a failure:', e));
    return res.status(status).json({ error });
  };

  // The main /admin screen has one combined login form that tries admin
  // credentials, then falls back to a learning-center login — so when no
  // `role` is given we mirror that by trying both in order.
  if (!role || role === 'admin') {
    const adminLogin = process.env.ADMIN_LOGIN;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminLogin && adminPassword && trimmedLogin === adminLogin && sameSecret(adminPassword, password)) {
      const customToken = await mintCustomTokenForEmail(ADMIN_FB_EMAIL);
      return res.status(200).json({ role: 'admin', customToken });
    }
    if (role === 'admin') return fail(401, 'Invalid admin credentials.');
  }

  if (!role || role === 'center') {
    const snap = await db.collection('learningCenters').where('login', '==', trimmedLogin).limit(1).get();
    if (snap.empty) {
      if (role === 'center') return fail(401, 'Incorrect login or password.');
    } else {
      const centerDoc = snap.docs[0];
      const data = centerDoc.data();
      if (!sameSecret(data.password, password)) {
        if (role === 'center') return fail(401, 'Incorrect login or password.');
      } else {
        const customToken = await mintCustomTokenForEmail(`${CENTER_FB_PREFIX}${centerDoc.id}@writeready.internal`);
        return res.status(200).json({ role: 'center', customToken, centerId: centerDoc.id, centerName: data.name ?? 'Center' });
      }
    }
  }

  if (role === 'teacher') {
    const found = await findTeacherLogin(trimmedLogin);
    if (!found || !sameSecret(found.password, password)) return fail(401, 'Incorrect login or password.');
    const teacherRef = db.collection('teachers').doc(found.teacherId);
    const teacher = await teacherRef.get();
    if (!teacher.exists) return fail(401, 'Incorrect login or password.');
    const data = teacher.data()!;
    if (data.active === false) return res.status(403).json({ error: 'This account is inactive. Please contact the admin.' });
    if (found.legacy) {
      // Move this login off the public profile now. One batch, so it is
      // never lost half way; if it fails, the admin panel moves it later.
      const batch = db.batch();
      batch.set(db.collection('teacherAuth').doc(found.teacherId), { login: trimmedLogin, password: found.password }, { merge: true });
      batch.update(teacherRef, { login: FieldValue.delete(), password: FieldValue.delete() });
      await batch.commit().catch((e) => console.error('staff-login: could not move a teacher login:', e));
    }
    const customToken = await mintCustomTokenForEmail(`${TEACHER_FB_PREFIX}${found.teacherId}@writeready.internal`);
    return res.status(200).json({ role: 'teacher', customToken, teacherId: found.teacherId, teacherName: data.name ?? 'Teacher' });
  }

  return fail(401, 'Incorrect login or password.');
}
