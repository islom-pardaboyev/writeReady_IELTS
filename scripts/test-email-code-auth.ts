/**
 * Checks the Firebase side of confirming an email (api/_lib/routes/emailCode.ts
 * and the gate in api/_lib/shared.ts) on the Firebase Auth emulator, so it
 * runs against real Firebase code but never the live project.
 *
 * Start the emulator first (it needs a folder with this firebase.json):
 *
 *   {"emulators":{"auth":{"port":9099,"host":"127.0.0.1"},"ui":{"enabled":false}}}
 *   npx firebase-tools emulators:start --only auth --project demo-writeready
 *
 * Then:
 *
 *   npx tsx scripts/test-email-code-auth.ts
 *
 * A "demo-" project only exists on the emulator. Codes are kept in memory and
 * never emailed.
 */

import type { Deps } from '../api/_lib/emailCode.js';

// Set before any Firebase code loads, so nothing can reach the live project.
const HOST = '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = HOST;
const PROJECT = 'demo-writeready';

const { initializeApp: initAdmin, getApps } = await import('firebase-admin/app');
const { getAuth: adminAuth } = await import('firebase-admin/auth');
const { initializeApp } = await import('firebase/app');
const {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithCustomToken, signOut, inMemoryPersistence, setPersistence,
} = await import('firebase/auth');
const { firebaseAuthDeps } = await import('../api/_lib/routes/emailCode.js');
const { sendCode, verifyCode } = await import('../api/_lib/emailCode.js');
const { getUid } = await import('../api/_lib/shared.js');
const { mustConfirmEmail } = await import('../api/_lib/emailGate.js');

try {
  await fetch(`http://${HOST}/`);
} catch {
  console.error(`No Auth emulator on ${HOST}. Start it first (see the top of this file).`);
  process.exit(1);
}
await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

if (!getApps().length) initAdmin({ projectId: PROJECT });
const admin = adminAuth();

let n = 0;
/** A browser of its own: someone else's computer. */
async function browser() {
  const auth = getAuth(initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `b${++n}`));
  connectAuthEmulator(auth, `http://${HOST}`, { disableWarnings: true });
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

// The real Firebase rules with the codes kept in memory instead of Firestore.
const inbox = new Map<string, string>();
const tables = new Map<string, Record<string, unknown>>();
const deps = {
  now: () => Date.now(),
  send: async (email: string, code: string) => { inbox.set(email, code); },
  update: async (collection: string, key: string, fn: (cur: Record<string, unknown> | null) => { next: unknown; result: unknown }) => {
    const id = `${collection}/${key}`;
    const { next, result } = fn(structuredClone(tables.get(id) ?? null));
    if (next === null) tables.delete(id);
    else if (next) tables.set(id, structuredClone(next as Record<string, unknown>));
    return result;
  },
  auth: firebaseAuthDeps(),
} as Deps;

async function codeFor(email: string): Promise<string> {
  // Each check uses its own address, so the one-a-minute limit never gets in the way.
  await sendCode(deps, email, 'test');
  return inbox.get(email)!;
}

const asApi = (idToken: string) => getUid({ headers: { authorization: `Bearer ${idToken}` } } as never);
const refused = (p: Promise<unknown>) => p.then(() => false, () => true);

/**
 * Whether the sessions an old token came from were revoked. The emulator
 * does not refuse a revoked session's refresh the way the live Firebase does,
 * so this checks what the revoke leaves behind: Firebase itself calling
 * the old token revoked.
 */
async function sessionEnded(oldToken: string): Promise<boolean> {
  try {
    await admin.verifyIdToken(oldToken, true);
    return false;
  } catch (e) {
    return (e as { code?: string }).code === 'auth/id-token-revoked';
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}

console.log('confirming an email, on the Auth emulator');

// Someone makes an account with another person's email, straight through
// Firebase, and stays signed in. The owner then signs in with an email code.
{
  const email = 'owner@example.com';
  const intruder = await browser();
  const made = await createUserWithEmailAndPassword(intruder, email, 'intruder1');
  const token = await made.user.getIdTokenResult();
  // Revoking works in whole seconds: make sure this token is from an earlier one.
  await new Promise((r) => setTimeout(r, 1100));
  check('the site sees a password sign-in with an unconfirmed email', mustConfirmEmail(token.signInProvider, made.user.email, made.user.emailVerified));
  check('the API refuses it', await refused(asApi(token.token)));

  const { token: custom, created } = await verifyCode(deps, email, await codeFor(email));
  const record = await admin.getUserByEmail(email);
  check('the code signs the owner into that same account', !created && record.uid === made.user.uid);
  check('the email is now confirmed', record.emailVerified);
  check('the account keeps its email', record.email === email);
  check('the intruder cannot sign in with it', await refused(signInWithEmailAndPassword(await browser(), email, 'intruder1')));
  check("the intruder's open session is ended", await sessionEnded(token.token));

  const owner = await browser();
  const signedIn = await signInWithCustomToken(owner, custom);
  const fresh = await signedIn.user.getIdToken(true);
  check('the owner signs in straight after', signedIn.user.uid === made.user.uid && signedIn.user.emailVerified);
  check('and the API lets them in', (await asApi(fresh)) === made.user.uid);
}

// The same, but the owner signs up (or signs in) with a password of their own.
{
  const email = 'chooser@example.com';
  const intruder = await browser();
  const made = await createUserWithEmailAndPassword(intruder, email, 'intruder1');
  const old = await made.user.getIdToken();
  await new Promise((r) => setTimeout(r, 1100));
  await verifyCode(deps, email, await codeFor(email), 'owners-own1');
  check('the account now has the owner\'s password', (await signInWithEmailAndPassword(await browser(), email, 'owners-own1')).user.uid === made.user.uid);
  check('not the intruder\'s', await refused(signInWithEmailAndPassword(await browser(), email, 'intruder1')));
  check("and the intruder's session is ended", await sessionEnded(old));
}

// A new sign-up and an ordinary confirmed account.
{
  const email = 'new@example.com';
  const { token: custom, created } = await verifyCode(deps, email, await codeFor(email), 'newpass1');
  check('a new sign-up makes a confirmed account', created && (await admin.getUserByEmail(email)).emailVerified);
  const b = await browser();
  await signInWithCustomToken(b, custom);
  await signOut(b);
  const again = await signInWithEmailAndPassword(b, email, 'newpass1');
  const t = await again.user.getIdTokenResult();
  check('it signs in with its password later', again.user.emailVerified && !mustConfirmEmail(t.signInProvider, again.user.email, again.user.emailVerified));
  check('and the API lets it in', (await asApi(t.token)) === again.user.uid);
}

// A learning-centre student's made-up address is never asked to confirm.
{
  const b = await browser();
  const s = await createUserWithEmailAndPassword(b, 'ali@writeready.student', 'student1');
  check('a centre student gets through the API', (await asApi(await s.user.getIdToken())) === s.user.uid);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
