// A Telegram username is 5–32 characters: letters, digits and underscores,
// starting with a letter. We store it with the leading "@" so it can be pasted
// straight into a Telegram message to tag the person.
// api/_lib/teacherNotice.ts has its own copy of this pattern (api/ and src/ are
// separate builds) — keep the two in step.
export const TELEGRAM_USERNAME_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

export const TELEGRAM_USERNAME_HELP =
  'Telegram username must start with @ and have 5 to 32 letters, numbers or underscores.';

/**
 * Turns whatever was typed or pasted into "@name": drops spaces and other
 * characters, accepts a pasted t.me link, and always starts with one "@".
 * Returns "" when nothing usable is left, so the field can be cleared.
 */
export function normalizeTelegramUsername(raw: string): string {
  const name = raw.trim().replace(/^(https?:\/\/)?t\.me\//i, '').replace(/[^A-Za-z0-9_]/g, '');
  return name ? `@${name}` : '';
}
