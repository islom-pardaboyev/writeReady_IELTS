import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initFirebase } from './_lib/shared.js';

/**
 * Changes or removes a learning-center student. Used by the center portal
 * (src/pages/CenterAdminPage.tsx) and the admin panel
 * (src/pages/writing/admin/CentersSection.tsx).
 *
 * A student signs in with `<login>@writeready.student` and a password held by
 * Firebase Auth. Only the Admin SDK can change those, so this runs on the
 * server. The portals used to write the new login and password into
 * Firestore only: the screen said "saved", but a renamed student could no
 * longer sign in with the login they were given, and a new password did
 * nothing. Removing a student also left their paid plan in place, so they
 * kept the center's access after "losing" it.
 *
 *   POST { action: 'update', centerId, studentId, fullName, login?, password? }
 *   POST { action: 'remove', centerId, studentId }
 *
 * Callers: the admin, or the center that owns the student, signed in through
 * api/staff-login.ts.
 */

const ADMIN_EMAIL = 'admin@writeready.internal';
const STUDENT_EMAIL_DOMAIN = 'writeready.student';
// The same shape an email address allows before the @, kept simple.
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,59}$/;

async function callerCanManage(req: VercelRequest, centerId: string): Promise<boolean> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  const decoded = await getAuth().verifyIdToken(token);
  // Staff sign in with custom tokens only; a student can never pass this.
  if (decoded.firebase?.sign_in_provider !== 'custom') return false;
  const email = (decoded.email ?? '').toLowerCase();
  return email === ADMIN_EMAIL || email === `center_${centerId}@writeready.internal`.toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e) {
    console.error('center-student: Firebase init failed:', e);
    return res.status(500).json({ error: 'The server could not start. Try again in a minute.' });
  }

  const { action, centerId, studentId, fullName, login, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof centerId !== 'string' || !centerId || centerId.includes('/')
    || typeof studentId !== 'string' || !studentId || studentId.includes('/')) {
    return res.status(400).json({ error: 'centerId and studentId are required.' });
  }

  try {
    if (!(await callerCanManage(req, centerId))) return res.status(403).json({ error: 'Not allowed.' });
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }

  const db = getFirestore();
  const studentRef = db.collection('learningCenters').doc(centerId).collection('students').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) return res.status(404).json({ error: 'Student not found.' });
  const student = studentSnap.data()!;
  // New students use their uid as the document id; older ones carry it in a field.
  const uid = typeof student.uid === 'string' && student.uid ? student.uid : studentId;
  const userRef = db.collection('users').doc(uid);

  if (action === 'remove') {
    const userSnap = await userRef.get();
    const batch = db.batch();
    batch.delete(studentRef);
    if (userSnap.exists && userSnap.data()!.centerId === centerId) {
      const u = userSnap.data()!;
      const ownLifetime = u.plan === 'forever' || u.subscription === 'forever';
      // The account stays, so the student keeps their history, but it is an
      // ordinary free account from now on. A lifetime plan they bought
      // themselves is theirs to keep.
      batch.update(userRef, {
        ...(ownLifetime ? {} : { plan: 'free', expiresAt: '', subscriptionExpiresAt: null }),
        centerId: FieldValue.delete(),
        centerName: FieldValue.delete(),
      });
    }
    await batch.commit();
    return res.status(200).json({ ok: true });
  }

  if (action !== 'update') return res.status(400).json({ error: 'Unknown action.' });

  const name = typeof fullName === 'string' ? fullName.trim() : '';
  if (!name || name.length > 100) return res.status(400).json({ error: 'Enter a name of up to 100 characters.' });

  const oldLogin = typeof student.login === 'string' ? student.login : '';
  const newLogin = typeof login === 'string' ? login.trim().toLowerCase() : oldLogin;
  const loginChanged = newLogin !== oldLogin;
  if (loginChanged && !LOGIN_RE.test(newLogin)) {
    return res.status(400).json({ error: 'A login uses 2–60 letters, numbers, dots, dashes or underscores, with no spaces.' });
  }
  const newPassword = typeof password === 'string' ? password.trim() : '';
  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ error: 'The password needs at least 6 characters.' });
  }

  if (loginChanged) {
    const taken = await studentRef.parent.where('login', '==', newLogin).limit(1).get();
    if (!taken.empty) return res.status(409).json({ error: 'That login is already used by another student in this center.' });
  }

  // The sign-in account first: if it refuses, nothing else has changed.
  if (loginChanged || newPassword) {
    try {
      await getAuth().updateUser(uid, {
        ...(loginChanged ? { email: `${newLogin}@${STUDENT_EMAIL_DOMAIN}` } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-exists') return res.status(409).json({ error: 'That login is already taken. Choose another.' });
      if (code === 'auth/user-not-found') return res.status(404).json({ error: 'This student has no sign-in account. Remove them and add them again.' });
      if (code === 'auth/invalid-password') return res.status(400).json({ error: 'The password needs at least 6 characters.' });
      console.error('center-student: could not update the sign-in account:', e);
      return res.status(500).json({ error: 'Could not update the sign-in account. Try again.' });
    }
  }

  const batch = db.batch();
  // The password is never kept in the database: it lives in Firebase Auth
  // only. Older student records still carry one, so it is removed here.
  batch.update(studentRef, { fullName: name, login: newLogin, password: FieldValue.delete() });
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    batch.update(userRef, {
      fullName: name,
      studentLogin: newLogin,
      ...(loginChanged ? { email: `${newLogin}@${STUDENT_EMAIL_DOMAIN}` } : {}),
    });
  }
  await batch.commit();
  return res.status(200).json({ ok: true, login: newLogin });
}
