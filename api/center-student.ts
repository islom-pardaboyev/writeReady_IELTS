import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initFirebase, readStaffToken, isAdminToken, isCenterToken } from './_lib/shared.js';

/**
 * Creates, changes or removes a learning-center student. Used by the center
 * portal (src/pages/CenterAdminPage.tsx) and the admin panel
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
 * The sign-in account is made here too, with its email already confirmed.
 * The site keeps password accounts with an unconfirmed email out, and made-up
 * addresses cannot receive the confirmation email. Making the account in the
 * browser (Firebase's public sign-up address) would leave it unconfirmed, and
 * the only way round that was to trust any address ending in
 * `@writeready.student`, which anyone can register for themselves.
 *
 *   POST { action: 'create', centerId, login, password }
 *   POST { action: 'update', centerId, studentId, fullName, login?, password? }
 *   POST { action: 'remove', centerId, studentId }
 *
 * Callers: the admin, or the center that owns the student, signed in through
 * api/staff-login.ts.
 *
 * The center's own student records can be written by the center (see
 * firestore.rules), so nothing in them is trusted: before this touches a
 * sign-in account or a profile it checks the profile belongs to the center.
 * Otherwise a center could point a record's `uid` at anyone's account and set
 * that account's login and password.
 */

const STUDENT_EMAIL_DOMAIN = 'writeready.student';
// The same shape an email address allows before the @, kept simple.
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,59}$/;
const MAX_PASSWORD = 128;

const NOT_LINKED = "This student's sign-in account is not linked to your center, so it cannot be changed. Remove the student and add them again.";

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
  if (typeof centerId !== 'string' || !centerId || centerId.includes('/')) {
    return res.status(400).json({ error: 'centerId is required.' });
  }

  const staff = await readStaffToken(req);
  if (!staff) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  const role = isAdminToken(staff) ? 'admin' : isCenterToken(staff, centerId) ? 'center' : null;
  if (!role) return res.status(403).json({ error: 'Not allowed.' });

  const db = getFirestore();

  if (action === 'create') {
    const newLogin = typeof login === 'string' ? login.trim().toLowerCase() : '';
    if (!LOGIN_RE.test(newLogin)) {
      return res.status(400).json({ error: 'A login uses 2–60 letters, numbers, dots, dashes or underscores, with no spaces.' });
    }
    const newPassword = typeof password === 'string' ? password.trim() : '';
    if (newPassword.length < 6 || newPassword.length > MAX_PASSWORD) {
      return res.status(400).json({ error: 'The password needs at least 6 characters.' });
    }
    if (!(await db.collection('learningCenters').doc(centerId).get()).exists) {
      return res.status(404).json({ error: 'Center not found.' });
    }
    try {
      const made = await getAuth().createUser({
        email: `${newLogin}@${STUDENT_EMAIL_DOMAIN}`,
        password: newPassword,
        emailVerified: true,
      });
      return res.status(200).json({ ok: true, uid: made.uid, login: newLogin });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-exists') return res.status(409).json({ error: 'That login is already taken. Choose another.' });
      if (code === 'auth/invalid-password') return res.status(400).json({ error: 'The password needs at least 6 characters.' });
      console.error('center-student: could not create the sign-in account:', e);
      return res.status(500).json({ error: 'Could not create the student account. Try again.' });
    }
  }

  if (typeof studentId !== 'string' || !studentId || studentId.includes('/')) {
    return res.status(400).json({ error: 'centerId and studentId are required.' });
  }

  const studentRef = db.collection('learningCenters').doc(centerId).collection('students').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) return res.status(404).json({ error: 'Student not found.' });
  const student = studentSnap.data()!;
  // New students use their uid as the document id; older ones carry it in a field.
  const uid = typeof student.uid === 'string' && student.uid ? student.uid : studentId;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  // The student record above is the center's own to write, so the uid in it
  // proves nothing. The profile is what says whose student this is.
  const linked = userSnap.exists && userSnap.data()!.centerId === centerId;
  const mayTouchAccount = role === 'admin' || linked;

  if (action === 'remove') {
    const batch = db.batch();
    batch.delete(studentRef);
    if (linked) {
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
  if (newPassword && (newPassword.length < 6 || newPassword.length > MAX_PASSWORD)) {
    return res.status(400).json({ error: 'The password needs at least 6 characters.' });
  }

  if (loginChanged) {
    const taken = await studentRef.parent.where('login', '==', newLogin).limit(1).get();
    if (!taken.empty) return res.status(409).json({ error: 'That login is already used by another student in this center.' });
  }

  // The sign-in account first: if it refuses, nothing else has changed.
  if (loginChanged || newPassword) {
    if (!mayTouchAccount) return res.status(409).json({ error: NOT_LINKED });
    try {
      // Only ever a learning-centre sign-in account: an ordinary student's
      // email and password are never changed from here.
      const current = await getAuth().getUser(uid);
      if (!(current.email ?? '').toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`)) {
        return res.status(409).json({ error: NOT_LINKED });
      }
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
  if (mayTouchAccount && userSnap.exists) {
    batch.update(userRef, {
      fullName: name,
      studentLogin: newLogin,
      ...(loginChanged ? { email: `${newLogin}@${STUDENT_EMAIL_DOMAIN}` } : {}),
    });
  }
  await batch.commit();
  return res.status(200).json({ ok: true, login: newLogin });
}
