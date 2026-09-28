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

type Doc = Record<string, unknown>;

function world() {
  const tables = { email_codes: new Map<string, Doc>(), email_code_ips: new Map<string, Doc>() };
  const inbox = new Map<string, string>();
  const users = new Map<string, { uid: string; disabled: boolean; emailVerified: boolean }>();
  const created: string[] = [];
  const verified: string[] = [];
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
      createUser: async (email) => {
        const uid = `new_${users.size + 1}`;
        users.set(email, { uid, disabled: false, emailVerified: true });
        created.push(email);
        return uid;
      },
      markVerified: async (uid) => {
        verified.push(uid);
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
    verified,
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
  const token = await verifyCode(w.deps, 'new.student@gmail.com', code);
  check('the right code returns a token for a new account', token === 'token-for-new_1' && w.created[0] === 'new.student@gmail.com', token);
  check('a used code cannot be used again', await rejects(() => verifyCode(w.deps, 'new.student@gmail.com', code), 400, 'Ask for a code'));
}

// An account made with Google signs in as itself; spaces in the code are fine.
{
  const w = world();
  w.users.set('google.user@gmail.com', { uid: 'google_uid', disabled: false, emailVerified: true });
  await sendCode(w.deps, 'google.user@gmail.com', '1.2.3.4');
  const code = w.inbox.get('google.user@gmail.com')!;
  const token = await verifyCode(w.deps, 'google.user@gmail.com', `${code.slice(0, 3)} ${code.slice(3)}`);
  check('an existing Google account signs in as itself', token === 'token-for-google_uid' && w.created.length === 0, token);
  check('no second account is made', w.users.size === 1);
}

// An unverified password account is marked verified; a switched-off one is refused.
{
  const w = world();
  w.users.set('pw@example.com', { uid: 'pw_uid', disabled: false, emailVerified: false });
  w.users.set('off@example.com', { uid: 'off_uid', disabled: true, emailVerified: true });
  await sendCode(w.deps, 'pw@example.com', 'a');
  await verifyCode(w.deps, 'pw@example.com', w.inbox.get('pw@example.com'));
  check('an unverified account becomes verified', w.verified.includes('pw_uid'));
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
  check('the newer code works', (await verifyCode(w.deps, 'twice@example.com', second)).startsWith('token-for-'));
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

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
