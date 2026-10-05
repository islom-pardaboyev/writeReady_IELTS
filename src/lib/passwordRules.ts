/**
 * What a new password needs, one regular expression per rule, so the form can
 * show each rule ticking off as the student types (PasswordChecklist). Used
 * when choosing a password: sign-up and the change on My Account. Signing in
 * never checks them, so an older, shorter password still works.
 *
 * The server keeps its own floor of 6 to 128 characters (api/_lib/emailCode.ts).
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', pattern: /^.{8,}$/s },
  { id: 'lower', label: 'A small letter (a–z)', pattern: /[a-z]/ },
  { id: 'upper', label: 'A capital letter (A–Z)', pattern: /[A-Z]/ },
  { id: 'number', label: 'A number (0–9)', pattern: /\d/ },
  { id: 'symbol', label: 'A symbol, like ! @ # ?', pattern: /[^A-Za-z0-9\s]/ },
] as const;

export type PasswordRule = (typeof PASSWORD_RULES)[number];

/** The rules `password` does not meet yet, in the order they are shown. */
export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.pattern.test(password));
}
