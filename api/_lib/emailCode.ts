import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { TESTER_EMAIL, isTesterEmail } from './testerAccount.js';

// Sign-in with a code sent by email: the student types their address, gets a
// 6-digit code, types it in, and is signed in to the account with that email
// (or a new one), whether they first signed up with Google or a password.
// Useful on a shared computer where they will not sign in to Google.
//
// Sign-up with a password goes through the same code: the account is created
// only after the student proves the address is theirs.
//
// The logic here only talks to the small `Deps` below, so it can be checked
// offline (scripts/test-email-code.ts); api/_lib/routes/emailCode.ts wires it
// to Firestore, Firebase Auth and the email sender.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
/** Shortest wait between two codes for one address. */
export const RESEND_GAP_MS = 60 * 1000;
/** Codes one address can be sent in an hour: a wrong address cannot be flooded. */
export const SENDS_PER_HOUR = 5;
/** Codes one network can ask for in an hour: a whole class on one connection still fits. */
export const IP_SENDS_PER_HOUR = 30;
/**
 * Wrong codes one address may have in a day, across all its codes. Without
 * it, five codes an hour with five tries each let a stranger make 600 guesses
 * a day at someone's account; with it, 20, about a 1-in-50,000 chance a day.
 * A student who mistypes a few times never gets near it.
 */
export const WRONG_CODES_PER_DAY = 20;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TOO_MANY_TODAY = 'Too many wrong codes were tried for this email today. Try again tomorrow, or sign in with Google or your password.';

/** The wrong codes counted for an address in the current 24 hours. */
function wrongToday(cur: Doc | null, now: number): { failWindowStart: number; fails: number } {
  const start = Number(cur?.failWindowStart);
  if (!cur || !Number.isFinite(start) || now - start >= DAY) return { failWindowStart: now, fails: 0 };
  return { failWindowStart: start, fails: Number(cur.fails) || 0 };
}

type Doc = Record<string, unknown>;

/**
 * One read-modify-write on one document, all or nothing (a Firestore
 * transaction in production). `next` undefined leaves the document as it is,
 * null deletes it, an object replaces it. Throwing inside `fn` changes nothing.
 */
export type Update = <R>(
  collection: 'email_codes' | 'email_code_ips',
  key: string,
  fn: (current: Doc | null) => { next: Doc | null | undefined; result: R },
) => Promise<R>;

export interface Deps {
  update: Update;
  send: (email: string, code: string) => Promise<void>;
  auth: {
    getUserByEmail(email: string): Promise<{ uid: string; disabled: boolean; emailVerified: boolean } | null>;
    /** Creates an account for an address the student has just proved is theirs, with a password when they chose one. */
    createUser(email: string, password?: string): Promise<string>;
    /**
     * Marks an unconfirmed account's email as proven. Its old password was
     * never proven to be the owner's, so it becomes `password` when they chose
     * one, or one nobody knows, and every other session on the account is ended.
     */
    claim(uid: string, password?: string): Promise<void>;
    createCustomToken(uid: string): Promise<string>;
  };
  now: () => number;
}

/** An error the student should see, with the HTTP status to send it with. */
export class CodeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Document ids are hashes, so no email address or network address is stored as a key. */
export const keyFor = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 40);

const hashCode = (salt: string, code: string) => createHash('sha256').update(`${salt}:${code}`).digest('hex');

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CodeError(400, 'Enter a valid email address.');
  }
  // Staff and learning-centre accounts use made-up addresses that cannot
  // receive email, and have sign-ins of their own. Never mint a token for them.
  if (email.endsWith('@writeready.internal')) throw new CodeError(400, 'Staff sign in on their own portal.');
  if (email.endsWith('@writeready.student')) throw new CodeError(400, 'Learning centre students sign in on the Student tab.');
  return email;
}

/** Sends a fresh code to `rawEmail`. Answers the same whether or not an account exists. */
export async function sendCode(deps: Deps, rawEmail: unknown, ip: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const now = deps.now();

  await deps.update('email_code_ips', keyFor(`ip:${ip || 'unknown'}`), (cur) => {
    const fresh = !cur || now - Number(cur.windowStart) >= HOUR;
    const count = fresh ? 0 : Number(cur.count) || 0;
    if (count >= IP_SENDS_PER_HOUR) {
      throw new CodeError(429, 'Too many codes were asked for from this network. Try again in an hour.');
    }
    return { next: { windowStart: fresh ? now : Number(cur!.windowStart), count: count + 1 }, result: undefined };
  });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  const key = keyFor(email);
  const previous = await deps.update('email_codes', key, (cur) => {
    // No new code once today's wrong codes are used up: each one is more guesses.
    const wrong = wrongToday(cur, now);
    if (wrong.fails >= WRONG_CODES_PER_DAY) throw new CodeError(429, TOO_MANY_TODAY);
    if (cur && now - Number(cur.lastSentAt) < RESEND_GAP_MS) {
      throw new CodeError(429, 'A code was just sent. Wait a minute before asking for another.');
    }
    const fresh = !cur || now - Number(cur.windowStart) >= HOUR;
    const sends = fresh ? 0 : Number(cur.sends) || 0;
    if (sends >= SENDS_PER_HOUR) throw new CodeError(429, 'Too many codes for this email. Try again in an hour.');
    // Only a salted hash of the code is stored. A new code replaces the old one.
    return {
      next: {
        codeHash: hashCode(salt, code),
        salt,
        expiresAt: now + CODE_TTL_MS,
        attempts: 0,
        lastSentAt: now,
        windowStart: fresh ? now : Number(cur!.windowStart),
        sends: sends + 1,
        ...wrong,
      },
      result: cur,
    };
  });

  try {
    await deps.send(email, code);
  } catch (e) {
    // The email never left: give back this send, so the student is not made to wait.
    await deps.update('email_codes', key, () => ({ next: previous ?? null, result: undefined })).catch(() => {});
    if (e instanceof CodeError) throw e;
    throw new CodeError(502, 'We could not send the email. Check the address and try again.');
  }
}

export const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;

/**
 * Checks the code and returns a Firebase custom token for the account with
 * that email. Sign-up passes the password the student chose: the account is
 * only created once the code proves the address is theirs. So does password
 * sign-in to an account whose email was never confirmed. `created` says
 * whether a new account was made; an address that already had a confirmed
 * one is simply signed in, and its password is left as it was.
 */
export async function verifyCode(
  deps: Deps,
  rawEmail: unknown,
  rawCode: unknown,
  rawPassword?: unknown,
): Promise<{ token: string; created: boolean }> {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === 'string' ? rawCode.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(code)) throw new CodeError(400, 'Enter the 6-digit code from the email.');
  // Checked before the code is used, so a password that is too short does not cost the code.
  let password: string | undefined;
  if (rawPassword !== undefined) {
    password = typeof rawPassword === 'string' ? rawPassword : '';
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new CodeError(400, `Choose a password of at least ${MIN_PASSWORD} characters.`);
    }
  }
  const now = deps.now();

  type Outcome = { kind: 'missing' | 'expired' | 'locked' | 'lockedToday' | 'ok' } | { kind: 'wrong'; left: number; today: boolean };
  const outcome = await deps.update<Outcome>('email_codes', keyFor(email), (cur) => {
    if (!cur || typeof cur.codeHash !== 'string') return { next: undefined, result: { kind: 'missing' } };
    const wrong = wrongToday(cur, now);
    // What stays after a code is used up: the sending limits and today's
    // wrong codes, not the code.
    const limits = { lastSentAt: cur.lastSentAt, windowStart: cur.windowStart, sends: cur.sends, ...wrong };
    if (wrong.fails >= WRONG_CODES_PER_DAY) return { next: undefined, result: { kind: 'lockedToday' } };
    if (now > Number(cur.expiresAt)) return { next: limits, result: { kind: 'expired' } };
    const attempts = Number(cur.attempts) || 0;
    if (attempts >= MAX_ATTEMPTS) return { next: undefined, result: { kind: 'locked' } };
    if (sameHash(hashCode(String(cur.salt), code), cur.codeHash)) return { next: limits, result: { kind: 'ok' } };
    const leftOnCode = MAX_ATTEMPTS - attempts - 1;
    const leftToday = WRONG_CODES_PER_DAY - wrong.fails - 1;
    return {
      next: { ...cur, attempts: attempts + 1, failWindowStart: wrong.failWindowStart, fails: wrong.fails + 1 },
      result: { kind: 'wrong', left: Math.min(leftOnCode, leftToday), today: leftToday <= 0 },
    };
  });

  switch (outcome.kind) {
    case 'missing':
      throw new CodeError(400, 'Ask for a code first.');
    case 'expired':
      throw new CodeError(400, 'This code has expired. Ask for a new one.');
    case 'locked':
      throw new CodeError(429, 'Too many wrong tries. Ask for a new code.');
    case 'lockedToday':
      throw new CodeError(429, TOO_MANY_TODAY);
    case 'wrong':
      if (outcome.left <= 0 && outcome.today) throw new CodeError(429, TOO_MANY_TODAY);
      throw new CodeError(
        400,
        outcome.left > 0
          ? `That code is not right. ${outcome.left} ${outcome.left === 1 ? 'try' : 'tries'} left.`
          : 'That code is not right. Ask for a new one.',
      );
  }

  const existing = await deps.auth.getUserByEmail(email);
  let uid: string;
  if (existing) {
    if (existing.disabled) throw new CodeError(403, 'This account is switched off. Message us on Telegram.');
    uid = existing.uid;
    // They just proved the address is theirs. Whoever set the password of an
    // unconfirmed account may not have been them (anyone can make one through
    // Firebase's public sign-up address), so that password does not survive.
    if (!existing.emailVerified) await deps.auth.claim(uid, password);
  } else {
    uid = await deps.auth.createUser(email, password);
  }
  return { token: await deps.auth.createCustomToken(uid), created: !existing };
}

/** The shared test account's password (api/_lib/testerAccount.ts). Server only, never sent to the browser. */
const TESTER_PASSWORD = 'tester!';

/**
 * Temporary: signs in the shared test account with its fixed password and no
 * emailed code, making it the first time (see api/_lib/testerAccount.ts).
 * Anything else is refused, so this is no way into any other account. It is
 * signed in with a custom token, so it keeps working even if someone signed
 * in as the tester changes the password on My Account.
 */
export async function testerSignIn(
  deps: Pick<Deps, 'auth'>,
  rawEmail: unknown,
  rawPassword: unknown,
): Promise<{ token: string; created: boolean }> {
  if (!isTesterEmail(rawEmail) || rawPassword !== TESTER_PASSWORD) {
    throw new CodeError(401, 'Incorrect email or password.');
  }
  const existing = await deps.auth.getUserByEmail(TESTER_EMAIL);
  let uid: string;
  if (existing) {
    if (existing.disabled) throw new CodeError(403, 'This account is switched off. Message us on Telegram.');
    uid = existing.uid;
    // Made some other way before this existed: mark it confirmed, or the site and the API keep it out.
    if (!existing.emailVerified) await deps.auth.claim(uid, TESTER_PASSWORD);
  } else {
    uid = await deps.auth.createUser(TESTER_EMAIL, TESTER_PASSWORD);
  }
  return { token: await deps.auth.createCustomToken(uid), created: !existing };
}
