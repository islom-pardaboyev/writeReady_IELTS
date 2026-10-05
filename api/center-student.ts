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
 *   POST { action: 'create', centerId, fullName, login, password }
 *   POST { action: 'update', centerId, studentId, fullName, login?, password? }
 *   POST { action: 'remove', centerId, studentId }
 *   POST { action: 'reports', centerId }   the scores of the center's students, for its portal
 *
 * Callers: the admin, or the center that owns the student, signed in through
 * api/staff-login.ts.
 *
 * `create` makes the whole student here: the sign-in account, the profile
 * that carries the center's plan, and the center's own record of them, after
 * checking the center has a place left. The portal used to write the profile
 * and the record itself, so the number of places it paid for was only checked
 * in its own browser, and a center could add as many paid students as it
 * liked by calling this and Firestore directly.
 *
 * Older student records were written by the centers themselves (firestore.rules
 * allowed it until the places were checked here), so nothing in them is
 * trusted: before this touches a sign-in account or a profile it checks the
 * profile belongs to the center. Otherwise a center could point a record's
 * `uid` at anyone's account and set that account's login and password.
 */

const STUDENT_EMAIL_DOMAIN = 'writeready.student';
// The same shape an email address allows before the @, kept simple.
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,59}$/;
const MAX_PASSWORD = 128;

const NOT_LINKED = "This student's sign-in account is not linked to your center, so it cannot be changed. Remove the student and add them again.";
const OUT_OF_DATE = 'This page is out of date. Reload it and try again.';
const CONTRACT_ENDED = 'Your contract has ended, so a new student would get nothing. Contact WriteReady to renew it.';

// What a center can sell its students. Same as centerPlanOf in
// src/lib/centerPricing.ts: anything else, including the old "pro", is the
// premium allowance every center had before plans existed.
const CENTER_PLANS = ['basic', 'standard', 'premium'];
const DEFAULT_CENTER_PLAN = 'premium';
// Same default as the center portal and the admin panel.
const DEFAULT_STUDENT_LIMIT = 30;
// Firestore's limit for an `in` query.
const IN_LIMIT = 30;

/** A refusal while adding a student, with the status to answer with. */
class AddError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type CenterData = Record<string, unknown>;

function centerPlan(c: CenterData): string {
  return typeof c.plan === 'string' && CENTER_PLANS.includes(c.plan) ? c.plan : DEFAULT_CENTER_PLAN;
}

/** The contract's last day ('YYYY-MM-DD'), or '' when there is none. */
function centerEndsAt(c: CenterData): string {
  return typeof c.expiresAt === 'string' ? c.expiresAt : '';
}

/** When the center's students lose access: the end of the contract's last day, as api/_lib/shared.ts reads it. */
function studentExpiry(c: CenterData): string {
  const ends = centerEndsAt(c);
  return ends ? `${ends}T23:59:59` : '';
}

function contractEnded(c: CenterData): boolean {
  const expiry = studentExpiry(c);
  if (!expiry) return false;
  const end = new Date(expiry);
  return !Number.isNaN(end.getTime()) && end < new Date();
}

/** The places the center bought. Same reading as the portal (`studentLimit ?? 30`). */
function studentLimit(c: CenterData): number {
  const n = Number(c.studentLimit ?? DEFAULT_STUDENT_LIMIT);
  return Number.isFinite(n) ? n : DEFAULT_STUDENT_LIMIT;
}

function placesUsedUp(limit: number): string {
  return `You have used all ${limit} student places. Remove a student or contact WriteReady for more places.`;
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
  if (typeof centerId !== 'string' || !centerId || centerId.includes('/')) {
    return res.status(400).json({ error: 'centerId is required.' });
  }

  const staff = await readStaffToken(req);
  if (!staff) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  const role = isAdminToken(staff) ? 'admin' : isCenterToken(staff, centerId) ? 'center' : null;
  if (!role) return res.status(403).json({ error: 'Not allowed.' });

  const db = getFirestore();

  if (action === 'reports') {
    // Only students whose own profile names this center. The center's
    // records of its students were once its own to write, so a uid in them
    // proves nothing; the profile is what says whose student this is.
    try {
      const profiles = await db.collection('users').where('centerId', '==', centerId).select().get();
      const uids = profiles.docs.map((d) => d.id);
      const slices: string[][] = [];
      for (let i = 0; i < uids.length; i += IN_LIMIT) slices.push(uids.slice(i, i + IN_LIMIT));
      const snaps = await Promise.all(slices.map((ids) =>
        db.collection('feedback_reports').where('uid', 'in', ids).select('uid', 'scores', 'createdAt').get()));
      const reports = snaps.flatMap((snap) => snap.docs.map((d) => {
        const r = d.data();
        const createdAt = r.createdAt as { toMillis?: () => number } | undefined;
        return {
          uid: String(r.uid ?? ''),
          scores: r.scores ?? null,
          createdAt: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : null,
        };
      }));
      return res.status(200).json({ reports });
    } catch (e) {
      console.error('center-student: could not load the reports:', e);
      return res.status(500).json({ error: 'Could not load the reports. Try again.' });
    }
  }

  if (action === 'create') {
    // An older copy of the portal sends no name: it went on to write the
    // profile itself, which firestore.rules no longer allows, and then deleted
    // the account it was handed. Refuse it before anything is made.
    if (typeof fullName !== 'string') return res.status(409).json({ error: OUT_OF_DATE });
    const name = fullName.trim();
    if (!name || name.length > 100) return res.status(400).json({ error: 'Enter a name of up to 100 characters.' });
    const newLogin = typeof login === 'string' ? login.trim().toLowerCase() : '';
    if (!LOGIN_RE.test(newLogin)) {
      return res.status(400).json({ error: 'A login uses 2–60 letters, numbers, dots, dashes or underscores, with no spaces.' });
    }
    const newPassword = typeof password === 'string' ? password.trim() : '';
    if (newPassword.length < 6 || newPassword.length > MAX_PASSWORD) {
      return res.status(400).json({ error: 'The password needs at least 6 characters.' });
    }

    const centerRef = db.collection('learningCenters').doc(centerId);
    const studentsRef = centerRef.collection('students');
    // A center is held to what it bought; the admin decides places, so is not.
    const checkPlaces = async (center: CenterData, countUsed: () => Promise<number>) => {
      if (role !== 'center') return;
      if (contractEnded(center)) throw new AddError(409, CONTRACT_ENDED);
      const limit = studentLimit(center);
      if ((await countUsed()) >= limit) throw new AddError(409, placesUsedUp(limit));
    };

    // Checked first so a full center is told so without an account being
    // made and taken back. The transaction below checks again for real.
    const centerSnap = await centerRef.get();
    if (!centerSnap.exists) return res.status(404).json({ error: 'Center not found.' });
    try {
      await checkPlaces(centerSnap.data()!, async () => (await studentsRef.count().get()).data().count);
    } catch (e) {
      if (e instanceof AddError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
    const taken = await studentsRef.where('login', '==', newLogin).limit(1).get();
    if (!taken.empty) return res.status(409).json({ error: 'That login is already used by one of your students.' });

    let uid: string;
    try {
      uid = (await getAuth().createUser({
        email: `${newLogin}@${STUDENT_EMAIL_DOMAIN}`,
        password: newPassword,
        emailVerified: true,
      })).uid;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-exists') return res.status(409).json({ error: 'That login is already taken. Choose another.' });
      if (code === 'auth/invalid-password') return res.status(400).json({ error: 'The password needs at least 6 characters.' });
      console.error('center-student: could not create the sign-in account:', e);
      return res.status(500).json({ error: 'Could not create the student account. Try again.' });
    }

    try {
      await db.runTransaction(async (tx) => {
        const center = await tx.get(centerRef);
        if (!center.exists) throw new AddError(404, 'Center not found.');
        const c = center.data()!;
        await checkPlaces(c, async () => (await tx.get(studentsRef.count())).data().count);
        const endsAt = centerEndsAt(c);
        // The plan and end date the center holds: api/pre-check.ts reads the
        // quota from this profile. Admin -> Centers copies a changed plan or
        // date onto every student (applyPlanToStudents).
        tx.create(db.collection('users').doc(uid), {
          email: `${newLogin}@${STUDENT_EMAIL_DOMAIN}`,
          studentLogin: newLogin,
          fullName: name,
          plan: centerPlan(c),
          expiresAt: studentExpiry(c),
          subscriptionExpiresAt: endsAt || null,
          centerId,
          centerName: typeof c.name === 'string' && c.name ? c.name : 'Center',
          bonusAnalyses: 0,
          createdAt: FieldValue.serverTimestamp(),
        });
        // No password here: it lives in the sign-in account only.
        tx.create(studentsRef.doc(uid), {
          fullName: name,
          login: newLogin,
          uid,
          addedAt: FieldValue.serverTimestamp(),
        });
        // Every add writes the center's record, so two adds for one center
        // at once run one after the other and the second counts the first.
        tx.update(centerRef, { studentsChangedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      // Take the sign-in account back, or the login would stay taken by an
      // account with no profile and the next try would be refused.
      await getAuth().deleteUser(uid).catch((err) => console.error('center-student: could not take back the sign-in account:', err));
      if (e instanceof AddError) return res.status(e.status).json({ error: e.message });
      console.error('center-student: could not save the new student:', e);
      return res.status(500).json({ error: 'Could not add the student. Try again.' });
    }
    return res.status(200).json({ ok: true, uid, login: newLogin });
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
