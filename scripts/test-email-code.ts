/**
 * Checks email-code sign-in (api/_lib/emailCode.ts) offline.
 *
 *   npx tsx scripts/test-email-code.ts
 *
 * Everything the logic touches is a stand-in: an in-memory store, a fake
 * mailbox and fake Firebase accounts. Nothing reaches Firestore, Firebase Auth
 * or Resend, and no email is sent.
 */

import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_GAP_MS,
  SENDS_PER_HOUR,
  IP_SENDS_PER_HOUR,
  CodeError,
  keyFor,
  sendCode,
  verifyCode,
  type Deps,
} from '../api/_lib/emailCode.js';
import { mustConfirmEmail } from '../api/_lib/emailGate.js';

type Doc = Record<string, unknown>;

function world() {
  const tables = { email_codes: new Map<string, Doc>(), email_code_ips: new Map<string, Doc>() };
  const inbox = new Map<string, string>();
  const users = new Map<string, { uid: string; disabled: boolean; emailVerified: boolean }>();
  const created: string[] = [];
  const passwords = new Map<string, string>();
  const claims: { uid: string; password?: string }[] = [];
  let clock = 1_800_000_000_000;
  let failNextSend = false;

  const deps: Deps = {
    now: () => clock,
    update: async (collection, key, fn) => {
      const table = tables[collection];
      const cur = table.get(key);
      const { next, result } = fn(cur ? structuredClone(cur) : null);
      if (next === null) table.delete(key);
      else if (next) table.set(key, structuredClone(next));
      return result;
    },
    send: async (email, code) => {
      if (failNextSend) {
        failNextSend = false;
        throw new Error('mail server down');
      }
      inbox.set(email, code);
    },
    auth: {
      getUserByEmail: async (email) => users.get(email) ?? null,
      createUser: async (email, password) => {
        const uid = `new_${users.size + 1}`;
        users.set(email, { uid, disabled: false, emailVerified: true });
        if (password) passwords.set(email, password);
        created.push(email);
        return uid;
      },
      claim: async (uid, password) => {
        claims.push({ uid, password });
        for (const [email, u] of users) {
          if (u.uid !== uid) continue;
          u.emailVerified = true;
          if (password) passwords.set(email, password);
          else passwords.delete(email);
        }
      },
      createCustomToken: async (uid) => `token-for-${uid}`,
    },
  };

  return {
    deps,
    tables,
    inbox,
    users,
    created,
    passwords,
    claims,
    advance: (ms: number) => { clock += ms; },
    failNextSend: () => { failNextSend = true; },
  };
}

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}
async function rejects(fn: () => Promise<unknown>, status: number, text?: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof CodeError && e.status === status && (!text || e.message.includes(text));
  }
}
const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

console.log('email-code sign-in');

// A new address: the code signs in and creates the account, verified.
{
  const w = world();
  await sendCode(w.deps, '  New.Student@Gmail.com ', '1.2.3.4');
  const code = w.inbox.get('new.student@gmail.com') ?? '';
  check('sends a 6-digit code to the trimmed, lower-cased address', /^\d{6}$/.test(code), code);
  const stored = JSON.stringify([...w.tables.email_codes.values()]);
  check('never stores the code itself', !stored.includes(`"${code}"`) && !stored.includes('new.student@gmail.com'));
  check('keys documents by a hash, not the address', w.tables.email_codes.has(keyFor('new.student@gmail.com')));
  const { token, created } = await verifyCode(w.deps, 'new.student@gmail.com', code);
  check('the right code returns a token for a new account', token === 'token-for-new_1' && created && w.created[0] === 'new.student@gmail.com', token);
  check('a code-only account has no password', !w.passwords.has('new.student@gmail.com'));
  check('a used code cannot be used again', await rejects(() => verifyCode(w.deps, 'new.student@gmail.com', code), 400, 'Ask for a code'));
}

// An account made with Google signs in as itself; spaces in the code are fine.
{
  const w = world();
  w.users.set('google.user@gmail.com', { uid: 'google_uid', disabled: false, emailVerified: true });
  await sendCode(w.deps, 'google.user@gmail.com', '1.2.3.4');
  const code = w.inbox.get('google.user@gmail.com')!;
  const { token, created } = await verifyCode(w.deps, 'google.user@gmail.com', `${code.slice(0, 3)} ${code.slice(3)}`);
  check('an existing Google account signs in as itself', token === 'token-for-google_uid' && !created && w.created.length === 0, token);
  check('no second account is made', w.users.size === 1);
}

// An unconfirmed password account is claimed by whoever proves the address;
// a switched-off one is refused.
{
  const w = world();
  w.users.set('pw@example.com', { uid: 'pw_uid', disabled: false, emailVerified: false });
  w.passwords.set('pw@example.com', 'someone-elses');
  w.users.set('off@example.com', { uid: 'off_uid', disabled: true, emailVerified: true });
  await sendCode(w.deps, 'pw@example.com', 'a');
  await verifyCode(w.deps, 'pw@example.com', w.inbox.get('pw@example.com'));
  check('an unconfirmed account becomes confirmed', w.users.get('pw@example.com')?.emailVerified === true);
  check('and its unproven password is removed', !w.passwords.has('pw@example.com') && w.claims[0]?.uid === 'pw_uid');

  const p = world();
  p.users.set('legacy@example.com', { uid: 'legacy_uid', disabled: false, emailVerified: false });
  p.passwords.set('legacy@example.com', 'someone-elses');
  await sendCode(p.deps, 'legacy@example.com', 'a');
  const res = await verifyCode(p.deps, 'legacy@example.com', p.inbox.get('legacy@example.com'), 'mine1234');
  check('with a password, an unconfirmed account signs in as itself', !res.created && res.token === 'token-for-legacy_uid');
  check('and gets the password of the one who proved the address', p.passwords.get('legacy@example.com') === 'mine1234' && p.users.get('legacy@example.com')?.emailVerified === true);

  await sendCode(w.deps, 'off@example.com', 'a');
  check('a switched-off account is refused', await rejects(() => verifyCode(w.deps, 'off@example.com', w.inbox.get('off@example.com')), 403));
}

// Wrong codes count down, then lock the code.
{
  const w = world();
  await sendCode(w.deps, 'guess@example.com', 'a');
  const code = w.inbox.get('guess@example.com')!;
  check('a wrong code says how many tries are left', await rejects(() => verifyCode(w.deps, 'guess@example.com', wrong(code)), 400, `${MAX_ATTEMPTS - 1} tries left`));
  for (let i = 1; i < MAX_ATTEMPTS; i++) await verifyCode(w.deps, 'guess@example.com', wrong(code)).catch(() => {});
  check(`after ${MAX_ATTEMPTS} wrong codes even the right one is refused`, await rejects(() => verifyCode(w.deps, 'guess@example.com', code), 429));
  check('a malformed code is refused before counting', await rejects(() => verifyCode(w.deps, 'guess@example.com', '12ab'), 400, '6-digit'));
}

// Codes expire.
{
  const w = world();
  await sendCode(w.deps, 'late@example.com', 'a');
  w.advance(CODE_TTL_MS + 1);
  check('a code older than 10 minutes is refused', await rejects(() => verifyCode(w.deps, 'late@example.com', w.inbox.get('late@example.com')), 400, 'expired'));
}

// Sending limits: one a minute, five an hour per address, many per network.
{
  const w = world();
  await sendCode(w.deps, 'limit@example.com', 'a');
  check('a second code within a minute is refused', await rejects(() => sendCode(w.deps, 'limit@example.com', 'a'), 429, 'Wait a minute'));
  for (let i = 1; i < SENDS_PER_HOUR; i++) {
    w.advance(RESEND_GAP_MS);
    await sendCode(w.deps, 'limit@example.com', 'a');
  }
  w.advance(RESEND_GAP_MS);
  check(`a ${SENDS_PER_HOUR + 1}th code in an hour is refused`, await rejects(() => sendCode(w.deps, 'limit@example.com', 'a'), 429, 'in an hour'));
  w.advance(60 * 60 * 1000);
  await sendCode(w.deps, 'limit@example.com', 'a');
  check('the allowance comes back after an hour', w.inbox.has('limit@example.com'));

  const n = world();
  for (let i = 0; i < IP_SENDS_PER_HOUR; i++) await sendCode(n.deps, `s${i}@example.com`, '9.9.9.9');
  check(`a whole class of ${IP_SENDS_PER_HOUR} on one network gets codes`, n.inbox.size === IP_SENDS_PER_HOUR);
  check('one more from that network is refused', await rejects(() => sendCode(n.deps, 'extra@example.com', '9.9.9.9'), 429, 'network'));
  await sendCode(n.deps, 'extra@example.com', '8.8.8.8');
  check('another network is not affected', n.inbox.has('extra@example.com'));
}

// A failed email gives the send back.
{
  const w = world();
  w.failNextSend();
  check('a failed email is reported', await rejects(() => sendCode(w.deps, 'bounce@example.com', 'a'), 502));
  await sendCode(w.deps, 'bounce@example.com', 'a');
  check('the student can ask again straight away', w.inbox.has('bounce@example.com'));
}

// A new code replaces the old one.
{
  const w = world();
  await sendCode(w.deps, 'twice@example.com', 'a');
  const first = w.inbox.get('twice@example.com')!;
  w.advance(RESEND_GAP_MS);
  await sendCode(w.deps, 'twice@example.com', 'a');
  const second = w.inbox.get('twice@example.com')!;
  if (first !== second) check('the older code stops working', await rejects(() => verifyCode(w.deps, 'twice@example.com', first), 400));
  else check('the older code stops working (same digits by chance, skipped)', true);
  check('the newer code works', (await verifyCode(w.deps, 'twice@example.com', second)).token.startsWith('token-for-'));
}

// Sign-up with a password: the account only exists once the code checks out.
{
  const w = world();
  await sendCode(w.deps, 'signup@example.com', 'a');
  check('sending the code creates no account', w.users.size === 0);
  const code = w.inbox.get('signup@example.com')!;
  check('a wrong code creates no account', (await rejects(() => verifyCode(w.deps, 'signup@example.com', wrong(code), 'secret12'), 400)) && w.users.size === 0);
  const { token, created } = await verifyCode(w.deps, 'signup@example.com', code, 'secret12');
  check('the right code creates the account with the chosen password', created && token === 'token-for-new_1' && w.passwords.get('signup@example.com') === 'secret12');
  check('the new account is marked verified', w.users.get('signup@example.com')?.emailVerified === true);

  const s = world();
  await sendCode(s.deps, 'short@example.com', 'a');
  const shortCode = s.inbox.get('short@example.com')!;
  check('a password under 6 characters is refused', await rejects(() => verifyCode(s.deps, 'short@example.com', shortCode, '12345'), 400, 'at least 6'));
  check('and it does not use up the code', (await verifyCode(s.deps, 'short@example.com', shortCode, '123456')).created);

  const e = world();
  e.users.set('taken@example.com', { uid: 'old_uid', disabled: false, emailVerified: true });
  await sendCode(e.deps, 'taken@example.com', 'a');
  const taken = await verifyCode(e.deps, 'taken@example.com', e.inbox.get('taken@example.com'), 'newpass1');
  check('signing up with an address that has an account signs into it', !taken.created && taken.token === 'token-for-old_uid');
  check('and leaves its password alone', !e.passwords.has('taken@example.com') && e.created.length === 0 && e.claims.length === 0);
}

// Addresses that must never get a code.
{
  const w = world();
  check('a staff address is refused', await rejects(() => sendCode(w.deps, 'admin@writeready.internal', 'a'), 400, 'Staff'));
  check('a learning-centre student address is refused', await rejects(() => sendCode(w.deps, 'ali@writeready.student', 'a'), 400, 'Student tab'));
  check('a staff address cannot verify either', await rejects(() => verifyCode(w.deps, 'admin@writeready.internal', '123456'), 400));
  check('a malformed address is refused', await rejects(() => sendCode(w.deps, 'not-an-email', 'a'), 400, 'valid email'));
  check('nothing was emailed for any of them', w.inbox.size === 0);
}

// Who is kept out of the site until they confirm their email (api/_lib/emailGate.ts).
console.log('\nemail gate');
check('a password sign-in with an unconfirmed email is kept out', mustConfirmEmail('password', 'ali@gmail.com', false));
check('a password sign-in with a confirmed email gets in', !mustConfirmEmail('password', 'ali@gmail.com', true));
check('a Google sign-in gets in', !mustConfirmEmail('google.com', 'ali@gmail.com', false));
check('a code sign-in gets in', !mustConfirmEmail('custom', 'ali@gmail.com', true));
// No exception for made-up addresses: anyone can register `x@writeready.student`
// through Firebase's public sign-up address. Centre students are made with the
// email already confirmed (api/center-student.ts), so they pass like anyone else.
check('a centre student with a confirmed email gets in', !mustConfirmEmail('password', 'ali@writeready.student', true));
check('a self-registered student address is kept out', mustConfirmEmail('password', 'ali@writeready.student', false));
check('a self-registered staff address is kept out', mustConfirmEmail('password', 'Admin@WriteReady.internal', false));
check('staff, who sign in with a custom token, get in', !mustConfirmEmail('custom', 'admin@writeready.internal', false));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
