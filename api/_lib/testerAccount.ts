/**
 * A shared test account, for now. Signing in or signing up as TESTER_EMAIL
 * with its fixed password gets straight in, with no emailed code: the first
 * time makes the account, with its email already marked confirmed, so the
 * site and the API treat it like any other confirmed account.
 *
 * No imports, so the site (through @shared) and the API use the same address.
 * Only the address is here: the password is checked on the server
 * (testerSignIn in api/_lib/emailCode.ts), so it never ships to the browser.
 *
 * To remove it: delete this file, testerSignIn and TESTER_PASSWORD in
 * api/_lib/emailCode.ts, the 'tester' action in api/_lib/routes/emailCode.ts,
 * and the isTesterEmail check in src/pages/AuthPage.tsx.
 */

export const TESTER_EMAIL = 'tester@gmail.com';

export function isTesterEmail(raw: unknown): boolean {
  return typeof raw === 'string' && raw.trim().toLowerCase() === TESTER_EMAIL;
}
