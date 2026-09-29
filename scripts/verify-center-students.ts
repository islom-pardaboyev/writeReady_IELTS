/**
 * One-time step: marks the email of every EXISTING learning-centre student as
 * confirmed in Firebase Auth. Run it before deploying the change that removes
 * the `@writeready.student` exception from the email check.
 *
 *   npx tsx scripts/verify-center-students.ts            (looks only, changes nothing)
 *   npx tsx scripts/verify-center-students.ts --apply    (makes the change)
 *   npx tsx scripts/verify-center-students.ts --show     (also lists the odd accounts below)
 *
 * Why: centre students sign in with a made-up address (`login@writeready.student`)
 * that cannot receive email. The site keeps password accounts with an
 * unconfirmed email out, and used to make one exception, for any address ending
 * in `@writeready.student`. Anyone can register such an address for themselves
 * through Firebase's public sign-up address, so the exception is gone. Students
 * made from now on are created with the email already confirmed
 * (api/center-student.ts). The ones made before are unconfirmed, and without
 * this step they would be signed out and unable to get back in.
 *
 * Only accounts that have a real centre profile (`users/<uid>` with a
 * `centerId`) are touched. A `@writeready.student` account with no centre
 * profile is reported and left alone: it is either a leftover of an add that
 * failed half way, or someone who registered the address themselves.
 *
 * It uses the same FIREBASE_* variables as the API (read from .env when they are
 * not already set) and so reaches the LIVE project. Without --apply it only
 * reads. Nothing here prints a password or a token.
 */
import { readFileSync } from 'node:fs';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebase } from '../api/_lib/shared.js';

const apply = process.argv.includes('--apply');
const show = process.argv.includes('--show');
const DOMAIN = '@writeready.student';

/** Reads .env for the three Firebase variables, when they are not set already. */
function loadEnv(): void {
  if (process.env.FIREBASE_PRIVATE_KEY) return;
  let text = '';
  try { text = readFileSync(new URL('../.env', import.meta.url), 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(FIREBASE_[A-Z_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main(): Promise<void> {
  loadEnv();
  initFirebase();
  const auth = getAuth();
  const db = getFirestore();

  // 1. Every user with a centre: these are the real centre students.
  const centreUsers = await db.collection('users').where('centerId', '>', '').get();
  const centreUids = new Set(centreUsers.docs.map((d) => d.id));

  // 2. Every Auth account with a student address, confirmed or not.
  const studentAccounts: { uid: string; emailVerified: boolean; email: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if ((u.email ?? '').toLowerCase().endsWith(DOMAIN)) {
        studentAccounts.push({ uid: u.uid, emailVerified: u.emailVerified, email: u.email ?? '' });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const toConfirm = studentAccounts.filter((a) => centreUids.has(a.uid) && !a.emailVerified);
  const alreadyConfirmed = studentAccounts.filter((a) => centreUids.has(a.uid) && a.emailVerified).length;
  const odd = studentAccounts.filter((a) => !centreUids.has(a.uid));
  const missingAccount = [...centreUids].length - studentAccounts.filter((a) => centreUids.has(a.uid)).length;

  console.log(`Centre profiles (users with a centerId): ${centreUids.size}`);
  console.log(`  with a ${DOMAIN} sign-in account, already confirmed: ${alreadyConfirmed}`);
  console.log(`  with a ${DOMAIN} sign-in account, NOT confirmed yet:  ${toConfirm.length}   <- these are what --apply fixes`);
  console.log(`  with no ${DOMAIN} sign-in account (other kind of account, or none): ${missingAccount}`);
  console.log(`${DOMAIN} accounts with NO centre profile (left alone): ${odd.length}`);
  if (show && odd.length) {
    console.log('  Those accounts:');
    for (const a of odd) console.log(`   - ${a.email} (${a.emailVerified ? 'confirmed' : 'not confirmed'})`);
  } else if (odd.length) {
    console.log('  (run with --show to list them)');
  }

  if (!apply) {
    console.log('\nDry run: nothing was changed. Run again with --apply to confirm the accounts above.');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const a of toConfirm) {
    try {
      await auth.updateUser(a.uid, { emailVerified: true });
      done++;
    } catch (e) {
      failed++;
      console.error(`could not confirm ${a.uid}:`, (e as Error).message);
    }
  }
  console.log(`\nConfirmed ${done} account(s)${failed ? `, ${failed} failed (see above)` : ''}.`);
}

main().then(() => process.exit(0), (e) => { console.error('failed:', e.message); process.exit(1); });
