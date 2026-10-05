/**
 * Checks who counts as staff, a centre's places and a centre's reports, on
 * the Firebase emulators: firestore.rules, api/staff-login.ts and
 * api/center-student.ts against real Firebase code, never the live project.
 *
 * Start the emulators first, from a folder with this firebase.json (put the
 * full path of this repo's firestore.rules in it):
 *
 *   {"firestore":{"rules":"/full/path/to/firestore.rules"},
 *    "emulators":{"auth":{"port":9099,"host":"127.0.0.1"},
 *                 "firestore":{"port":8080,"host":"127.0.0.1"},"ui":{"enabled":false}}}
 *   npx firebase-tools emulators:start --only auth,firestore --project demo-writeready
 *
 * Then:
 *
 *   npx tsx scripts/test-staff-rules.ts
 *
 * A "demo-" project only exists on the emulators. Everything in it is wiped
 * at the start of each run.
 */

// Set before any Firebase code loads, so nothing can reach the live project.
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1:8080';
const PROJECT = 'demo-writeready';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.GCLOUD_PROJECT = PROJECT;
// What api/staff-login.ts checks the admin against. Test values only.
process.env.ADMIN_LOGIN = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.OWNER_EMAIL = 'owner@example.com';

const { initializeApp: initAdmin, getApps } = await import('firebase-admin/app');
const { getAuth: adminAuthOf } = await import('firebase-admin/auth');
const { getFirestore: adminDbOf, Timestamp } = await import('firebase-admin/firestore');
const { initializeApp, deleteApp } = await import('firebase/app');
const {
  getAuth, connectAuthEmulator, signInWithCustomToken, updateEmail, inMemoryPersistence, setPersistence,
} = await import('firebase/auth');
const {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
} = await import('firebase/firestore');

for (const [name, host] of [['Auth', AUTH_HOST], ['Firestore', FIRESTORE_HOST]]) {
  try {
    await fetch(`http://${host}/`);
  } catch {
    console.error(`No ${name} emulator on ${host}. Start it first (see the top of this file).`);
    process.exit(1);
  }
}
await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

// The api/ routes call initFirebase(), which leaves an app that already exists alone.
if (!getApps().length) initAdmin({ projectId: PROJECT });
const admin = adminAuthOf();
const store = adminDbOf();

const staffLogin = (await import('../api/staff-login.js')).default;
const centerStudent = (await import('../api/center-student.js')).default;

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}

type Handler = (req: never, res: never) => unknown;
/** Runs an api/ route as Vercel would, and gives back its status and JSON. */
function callApi(handler: Handler, body: Record<string, unknown>, idToken?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      setHeader: () => res,
      status: (code: number) => { status = code; return res; },
      json: (b: Record<string, unknown>) => { resolve({ status, body: b }); return res; },
      send: (b: unknown) => { resolve({ status, body: { sent: b } }); return res; },
      end: () => { resolve({ status, body: {} }); return res; },
    };
    const req = { method: 'POST', headers: idToken ? { authorization: `Bearer ${idToken}` } : {}, body, query: {} };
    Promise.resolve(handler(req as never, res as never)).catch((e) => resolve({ status: 599, body: { thrown: String(e) } }));
  });
}

let n = 0;
const apps: ReturnType<typeof initializeApp>[] = [];
/** A browser of its own, signed in with this custom token. */
async function browser(customToken: string) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `b${++n}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  await setPersistence(auth, inMemoryPersistence);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = await signInWithCustomToken(auth, customToken);
  return { auth, db, user: cred.user, token: () => cred.user.getIdToken() };
}

/** True when the rules let it through, false when they refuse it. Anything else is a broken test. */
async function allowed(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') return false;
    throw e;
  }
}

/** A student who signed in with an email code: a custom token with no claims. */
async function codeSignIn(email: string) {
  const uid = (await admin.createUser({ email, emailVerified: true })).uid;
  return browser(await admin.createCustomToken(uid));
}

async function staffSignIn(body: Record<string, unknown>, ownerToken?: string) {
  const r = await callApi(staffLogin as Handler, body, ownerToken);
  if (r.status !== 200 || typeof r.body.customToken !== 'string') throw new Error(`staff-login refused: ${r.status} ${JSON.stringify(r.body)}`);
  return browser(r.body.customToken);
}

// ── The data ─────────────────────────────────────────────────────────────────
const future = '2099-12-31';
await store.doc('learningCenters/c1').set({ name: 'Centre One', plan: 'standard', expiresAt: future, studentLimit: 2, login: 'c1login', password: 'c1pass' });
await store.doc('learningCenters/c2').set({ name: 'Centre Two', plan: 'premium', expiresAt: future, studentLimit: 5, login: 'c2login', password: 'c2pass' });
await store.doc('learningCenters/c3').set({ name: 'Centre Three', plan: 'basic', expiresAt: '2020-01-31', studentLimit: 5, login: 'c3login', password: 'c3pass' });
await store.doc('teachers/t1').set({ name: 'Teacher One', active: true });
await store.doc('teachers/t2').set({ name: 'Teacher Two', active: true });
await store.doc('teacherAuth/t1').set({ login: 't1login', password: 't1pass' });

const student = await codeSignIn('student@example.com');
const other = await codeSignIn('other@example.com');
for (const s of [student, other]) await store.doc(`users/${s.user.uid}`).set({ email: s.user.email, plan: 'free' });
const scores = { taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRangeAccuracy: 6, overall: 6 };
await store.doc('feedback_reports/own').set({ uid: student.user.uid, taskType: 'Task 2', scores, createdAt: Timestamp.now() });
await store.doc('feedback_reports/others').set({ uid: other.user.uid, taskType: 'Task 2', scores, createdAt: Timestamp.now() });
const review = { status: 'pending', mode: 'task2', priceUZS: 20000, platformFeeUZS: 5000, studentName: 'S', studentEmail: 'student@example.com', teacherName: 'T', requestedAt: Timestamp.now() };
await store.doc('humanReviews/r1').set({ ...review, uid: student.user.uid, teacherId: 't1' });
await store.doc('humanReviews/r2').set({ ...review, uid: other.user.uid, teacherId: 't2' });

console.log('staff roles, on the emulators');

// ── The attack: a student renames their email to a staff address ────────────
{
  const attacker = await codeSignIn('attacker@example.com');
  // The emulator allows a browser to change the email, as the live project
  // does when Email Enumeration Protection is off: the worst case.
  await updateEmail(attacker.user, 'teacher_t1@writeready.internal');
  const result = await attacker.user.getIdTokenResult(true);
  check('the renamed session still counts as a custom sign-in (the attack was real)',
    result.signInProvider === 'custom' && result.claims.email === 'teacher_t1@writeready.internal');
  check('it cannot open that teacher\'s review', !(await allowed(getDoc(doc(attacker.db, 'humanReviews/r1')))));
  check('nor list that teacher\'s reviews', !(await allowed(getDocs(query(collection(attacker.db, 'humanReviews'), where('teacherId', '==', 't1'))))));
  check('nor mark one as checked', !(await allowed(updateDoc(doc(attacker.db, 'humanReviews/r1'), { status: 'checked', feedbackDocBase64: 'x', feedbackFileName: 'x.docx', checkedAt: 1 }))));

  await updateEmail(attacker.user, 'center_anything@writeready.internal');
  await attacker.user.getIdToken(true);
  check('renamed to a made-up centre, it cannot read every report', !(await allowed(getDocs(collection(attacker.db, 'feedback_reports')))));
  await updateEmail(attacker.user, 'center_c1@writeready.internal');
  await attacker.user.getIdToken(true);
  check('renamed to a real centre, it cannot open that centre', !(await allowed(getDoc(doc(attacker.db, 'learningCenters/c1')))));
  check('nor its students', !(await allowed(getDocs(collection(attacker.db, 'learningCenters/c1/students')))));
  check('and the API does not take it for that centre', (await callApi(centerStudent as Handler, { action: 'reports', centerId: 'c1' }, await attacker.token())).status === 401);
  await updateEmail(attacker.user, 'teacher_t1@writeready.internal');
  await attacker.user.getIdToken(true);

  // The real teacher signs in later. staff-login finds the account by its
  // email, which the attacker now holds, and gives the teacher a token for it
  // with the teacher's role. The attacker's own session still has none.
  const teacher = await staffSignIn({ role: 'teacher', login: 't1login', password: 't1pass' });
  check('the teacher, signing in after, gets in', await allowed(getDoc(doc(teacher.db, 'humanReviews/r1'))));
  await attacker.user.getIdToken(true);
  check('while the attacker, on the same account, still cannot', !(await allowed(getDoc(doc(attacker.db, 'humanReviews/r1')))));
}

// ── Staff signed in through staff-login ─────────────────────────────────────
{
  // A session from before roles were put in sign-in tokens: no claims.
  const oldUid = (await admin.createUser({ email: 'teacher_t2@writeready.internal' })).uid;
  const old = await browser(await admin.createCustomToken(oldUid));
  check('an old staff session (no role) is refused by the rules', !(await allowed(getDoc(doc(old.db, 'humanReviews/r2')))));

  await store.doc('teacherAuth/t2').set({ login: 't2login', password: 't2pass' });
  const teacher = await staffSignIn({ role: 'teacher', login: 't2login', password: 't2pass' });
  check('the same teacher, signed in again, is let in', await allowed(getDoc(doc(teacher.db, 'humanReviews/r2'))));
  check('on the same account as before', teacher.user.uid === oldUid);
  check('a teacher lists their own reviews', await allowed(getDocs(query(collection(teacher.db, 'humanReviews'), where('teacherId', '==', 't2')))));
  check('but not another teacher\'s', !(await allowed(getDocs(query(collection(teacher.db, 'humanReviews'), where('teacherId', '==', 't1'))))));
  check('nor another teacher\'s review by id', !(await allowed(getDoc(doc(teacher.db, 'humanReviews/r1')))));
  check('a teacher marks their own review as checked', await allowed(updateDoc(doc(teacher.db, 'humanReviews/r2'), { status: 'checked', feedbackDocBase64: 'eA==', feedbackFileName: 'f.docx', checkedAt: 1 })));
  check('a teacher reads no reports', !(await allowed(getDocs(collection(teacher.db, 'feedback_reports')))));

  // The admin: the password AND the owner's own verified sign-in.
  const owner = await codeSignIn('owner@example.com');
  const adminSession = await staffSignIn({ role: 'admin', login: 'test-admin', password: 'test-admin-password' }, await owner.token());
  const claims = (await adminSession.user.getIdTokenResult()).claims;
  check('the admin token carries the admin role', claims.staff === 'admin');
  check('the admin reads everything', await allowed(getDocs(collection(adminSession.db, 'feedback_reports'))) && await allowed(getDocs(collection(adminSession.db, 'users'))));
  const noOwner = await callApi(staffLogin as Handler, { role: 'admin', login: 'test-admin', password: 'test-admin-password' }, await student.token());
  check('the admin password without the owner\'s sign-in is refused', noOwner.status === 401);
}

// ── Students ────────────────────────────────────────────────────────────────
{
  check('a student reads their own report', await allowed(getDoc(doc(student.db, 'feedback_reports/own'))));
  check('a student lists their own reports', await allowed(getDocs(query(collection(student.db, 'feedback_reports'), where('uid', '==', student.user.uid)))));
  check('but not someone else\'s', !(await allowed(getDoc(doc(student.db, 'feedback_reports/others')))));
  check('a student opens their own Human Check', await allowed(getDoc(doc(student.db, 'humanReviews/r1'))));
  const fresh = await codeSignIn('newcomer@example.com');
  check('a new student makes their own free profile', await allowed(setDoc(doc(fresh.db, 'users', fresh.user.uid), { email: 'newcomer@example.com', plan: 'free', subscriptionExpiresAt: null, createdAt: 1, notification: 'hi' })));
}

console.log('\nlearning centres, on the emulators');

// ── A centre's places, checked on the server ─────────────────────────────────
{
  const c1 = await staffSignIn({ role: 'center', login: 'c1login', password: 'c1pass' });
  const c1Claims = (await c1.user.getIdTokenResult()).claims;
  check('the centre token carries its role and id', c1Claims.staff === 'center' && c1Claims.centerId === 'c1');
  const add = async (session: { token: () => Promise<string> }, centerId: string, login: string, extra: Record<string, unknown> = {}) =>
    callApi(centerStudent as Handler, { action: 'create', centerId, fullName: `Student ${login}`, login, password: 'secret12', ...extra }, await session.token());

  const a = await add(c1, 'c1', 'c1-alpha');
  check('a centre adds a student', a.status === 200 && typeof a.body.uid === 'string', JSON.stringify(a));
  const uidA = String(a.body.uid);
  const profile = (await store.doc(`users/${uidA}`).get()).data() ?? {};
  check('the profile carries the centre\'s plan and end date',
    profile.plan === 'standard' && profile.expiresAt === `${future}T23:59:59` && profile.subscriptionExpiresAt === future
      && profile.centerId === 'c1' && profile.centerName === 'Centre One' && profile.bonusAnalyses === 0
      && profile.studentLogin === 'c1-alpha' && profile.email === 'c1-alpha@writeready.student' && profile.fullName === 'Student c1-alpha',
    JSON.stringify(profile));
  const record = (await store.doc(`learningCenters/c1/students/${uidA}`).get()).data() ?? {};
  check('the centre\'s record of them is made, with no password', record.login === 'c1-alpha' && record.uid === uidA && !('password' in record));
  const account = await admin.getUser(uidA);
  check('their sign-in account is made with the email confirmed', account.email === 'c1-alpha@writeready.student' && account.emailVerified);

  check('a second student fits', (await add(c1, 'c1', 'c1-beta')).status === 200);
  const third = await add(c1, 'c1', 'c1-gamma');
  check('a third is refused: the centre bought two places', third.status === 409 && String(third.body.error).includes('all 2 student places'), JSON.stringify(third));
  check('and no sign-in account was left behind for it', await admin.getUserByEmail('c1-gamma@writeready.student').then(() => false, () => true));
  check('a login already used in the centre is refused', (await add(c1, 'c1', 'c1-alpha')).status === 409);

  // The old way round, straight from the portal, is closed.
  check('the centre cannot write its student list itself', !(await allowed(setDoc(doc(c1.db, 'learningCenters/c1/students/fake'), { fullName: 'F', login: 'f', uid: 'fake' }))));
  check('nor delete a record to free a place', !(await allowed(deleteDoc(doc(c1.db, `learningCenters/c1/students/${uidA}`)))));
  check('nor make a paid profile', !(await allowed(setDoc(doc(c1.db, 'users/someone-new'), {
    email: 'x@writeready.student', studentLogin: 'x', fullName: 'X', plan: 'standard', expiresAt: `${future}T23:59:59`,
    subscriptionExpiresAt: future, centerId: 'c1', centerName: 'Centre One', createdAt: 1, bonusAnalyses: 0,
  }))));
  check('it still reads its own record and students', await allowed(getDoc(doc(c1.db, 'learningCenters/c1'))) && await allowed(getDocs(collection(c1.db, 'learningCenters/c1/students'))));
  check('and its students\' profiles', await allowed(getDocs(query(collection(c1.db, 'users'), where('centerId', '==', 'c1')))));
  check('but not another centre', !(await allowed(getDoc(doc(c1.db, 'learningCenters/c2')))));
  check('nor another centre\'s students\' profiles', !(await allowed(getDocs(query(collection(c1.db, 'users'), where('centerId', '==', 'c2'))))));
  check('nor reports from Firestore directly', !(await allowed(getDocs(query(collection(c1.db, 'feedback_reports'), where('uid', 'in', [uidA, other.user.uid]))))));
  check('and the API will not add to another centre', (await add(c1, 'c2', 'c1-sneak')).status === 403);

  // An older copy of the portal sends no name, and would go on to write the
  // profile itself and then delete the account. It is refused first.
  const stale = await callApi(centerStudent as Handler, { action: 'create', centerId: 'c1', login: 'c1-stale', password: 'secret12' }, await c1.token());
  check('an out-of-date portal is told to reload, and nothing is made', stale.status === 409 && String(stale.body.error).includes('Reload')
    && await admin.getUserByEmail('c1-stale@writeready.student').then(() => false, () => true));

  // Reports: only the centre's own students'.
  await store.doc('feedback_reports/alpha').set({ uid: uidA, taskType: 'Task 1', scores, createdAt: Timestamp.now() });
  const reports = await callApi(centerStudent as Handler, { action: 'reports', centerId: 'c1' }, await c1.token());
  const list = (reports.body.reports ?? []) as { uid: string; createdAt: unknown; scores: unknown }[];
  check('the centre gets its students\' reports through the API', reports.status === 200 && list.length === 1 && list[0].uid === uidA && typeof list[0].createdAt === 'number', JSON.stringify(reports));
  check('and nobody else\'s', !list.some((r) => r.uid === other.user.uid || r.uid === student.user.uid));

  // Removing a student frees the place and ends the centre's view of them.
  const removed = await callApi(centerStudent as Handler, { action: 'remove', centerId: 'c1', studentId: uidA }, await c1.token());
  const after = (await store.doc(`users/${uidA}`).get()).data() ?? {};
  check('removing a student takes the centre\'s plan off them', removed.status === 200 && after.plan === 'free' && !('centerId' in after));
  const afterReports = await callApi(centerStudent as Handler, { action: 'reports', centerId: 'c1' }, await c1.token());
  check('and their reports are no longer the centre\'s to see', ((afterReports.body.reports ?? []) as unknown[]).length === 0);
  check('the freed place can be used again', (await add(c1, 'c1', 'c1-delta')).status === 200);

  // The admin decides places, so is not held to them.
  const ownerSession = await browser(await admin.createCustomToken((await admin.getUserByEmail('owner@example.com')).uid));
  const adminSession = await staffSignIn({ role: 'admin', login: 'test-admin', password: 'test-admin-password' }, await ownerSession.token());
  check('the admin can add past the limit', (await add(adminSession, 'c1', 'c1-by-admin')).status === 200);

  // A centre whose contract ended.
  const c3 = await staffSignIn({ role: 'center', login: 'c3login', password: 'c3pass' });
  const ended = await add(c3, 'c3', 'c3-late');
  check('a centre whose contract ended cannot add students', ended.status === 409 && String(ended.body.error).includes('contract'), JSON.stringify(ended));
}

// ── Many adds at once cannot go past the places ──────────────────────────────
{
  const c2 = await staffSignIn({ role: 'center', login: 'c2login', password: 'c2pass' });
  const token = await c2.token();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    callApi(centerStudent as Handler, { action: 'create', centerId: 'c2', fullName: `Rush ${i}`, login: `c2-rush-${i}`, password: 'secret12' }, token)));
  const ok = results.filter((r) => r.status === 200).length;
  const full = results.filter((r) => r.status === 409).length;
  check('eight adds at once into five places: exactly five get in', ok === 5 && full === 3, results.map((r) => r.status).join(','));
  const records = (await store.collection('learningCenters/c2/students').get()).size;
  const profiles = (await store.collection('users').where('centerId', '==', 'c2').get()).size;
  check('five records and five profiles, no more', records === 5 && profiles === 5, `${records} records, ${profiles} profiles`);
  let accounts = 0;
  for (let i = 0; i < 8; i++) accounts += await admin.getUserByEmail(`c2-rush-${i}@writeready.student`).then(() => 1, () => 0);
  check('and the refused ones left no sign-in accounts behind', accounts === 5, `${accounts} accounts`);
}

await Promise.all(apps.map((a) => deleteApp(a).catch(() => {})));
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
