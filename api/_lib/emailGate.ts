/**
 * Who has to confirm their email before using the site. No imports, so the
 * site (through @shared) and the API use the very same rule.
 *
 * Sign-up with a password only makes the account once the emailed code checks
 * out (api/_lib/emailCode.ts). But accounts made before that, or made straight
 * through Firebase's public sign-up address, have a password and an email
 * nobody proved. They stay out until the owner types a code we email them.
 *
 * There is no exception for made-up addresses. Learning-centre students have
 * ones (`<login>@writeready.student`), but the server makes their accounts
 * with the email already marked confirmed (api/center-student.ts), so they
 * pass like everyone else. An exception based on the address itself would let
 * anyone register `anything@writeready.student` through the public sign-up
 * address and skip this check.
 */

/**
 * True for someone signed in with a password whose email is not confirmed.
 * Google proves the address itself, and a code sign-in marks it confirmed.
 * `provider` is the token's sign_in_provider. `_email` is kept so callers do
 * not change, but the address plays no part.
 */
export function mustConfirmEmail(
  provider: string | null | undefined,
  _email: string | null | undefined,
  emailVerified: boolean | undefined,
): boolean {
  return provider === 'password' && emailVerified !== true;
}
