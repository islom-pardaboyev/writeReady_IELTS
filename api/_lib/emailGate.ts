/**
 * Who has to confirm their email before using the site. No imports, so the
 * site (through @shared) and the API use the very same rule.
 *
 * Sign-up with a password only makes the account once the emailed code checks
 * out (api/_lib/emailCode.ts). But accounts made before that, or made straight
 * through Firebase's public sign-up address, have a password and an email
 * nobody proved. They stay out until the owner types a code we email them.
 */

/** Made-up addresses for staff and learning-centre logins. They cannot get email and have sign-ins of their own. */
export function isInternalLogin(email: string | null | undefined): boolean {
  const e = (email ?? '').toLowerCase();
  return e.endsWith('@writeready.internal') || e.endsWith('@writeready.student');
}

/**
 * True for someone signed in with a password whose email is not confirmed.
 * Google proves the address itself, and a code sign-in marks it confirmed.
 * `provider` is the token's sign_in_provider.
 */
export function mustConfirmEmail(
  provider: string | null | undefined,
  email: string | null | undefined,
  emailVerified: boolean | undefined,
): boolean {
  return provider === 'password' && emailVerified !== true && !isInternalLogin(email);
}
