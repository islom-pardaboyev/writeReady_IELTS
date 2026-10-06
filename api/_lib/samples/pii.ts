/**
 * Takes the obvious personal details out of an essay before it is shared as a
 * public sample: email addresses, links, Telegram usernames, phone numbers,
 * "my name is ...", and the name under a letter's sign-off.
 *
 * It is a safety net, not the only check: the admin reads every essay in
 * Telegram before it is published, and rejects one that still gives a
 * student away. It errs towards leaving essay content alone: the figures in
 * a Task 1 answer ("1,200,000", "from 1990 to 2010") must survive it.
 */

export interface Stripped {
  text: string;
  /** How many details were taken out, for the log. */
  removed: number;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TELEGRAM_LINK = /\b(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[\w+/-]+/gi;
const URL = /\bhttps?:\/\/[^\s<>"')]+/gi;
// An @ that starts a word, so "user@mail.uz" (already gone by now) and "@" on its own are left alone.
const HANDLE = /(^|[^\w@./])@[A-Za-z][A-Za-z0-9_]{3,31}\b/g;
const PHONES = [
  // Uzbekistan: +998 90 123 45 67, 998901234567, (90) 123-45-67
  /(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b(?![.,]\d)/g,
  // Any number written with a leading +: +44 20 7946 0958, +1 (555) 123-4567
  /\+\d{1,3}[\s-]?(?:\(?\d{1,4}\)?[\s-]?){2,5}\d{2,4}\b/g,
];
const MY_NAME = /\b(my name is|my name's|i am called|i'm called)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})/giu;
// "Yours faithfully,\nAziz Karimov" -> the name goes, the sign-off stays.
const SIGN_OFF =
  /\b(yours (?:sincerely|faithfully|truly)|best regards|kind regards|warm regards|regards|best wishes|sincerely|many thanks|thanks again)\s*,?(\s*\n?\s*)([A-Z][\p{L}'-]+(?:[ \t]+[A-Z][\p{L}'.-]*){0,2})\s*$/gimu;

/** A run of digits long enough to be a phone number, not a Task 1 figure. */
function looksLikePhone(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return false;
  // "1,250,000" and "2.5 million" never reach here (no comma or dot allowed
  // inside a match), and years read "1990 to 2010". A real phone number is
  // grouped with spaces, dashes or brackets, or starts with + or 998.
  return /^\+|^\(?998|[\s()-]/.test(match.trim()) || digits.length >= 12;
}

export function stripPersonalDetails(input: string): Stripped {
  let removed = 0;
  const swap = (pattern: RegExp, text: string, to: (...groups: string[]) => string) =>
    text.replace(pattern, (...args: string[]) => {
      removed++;
      return to(...args);
    });

  let text = input;
  text = swap(EMAIL, text, () => '[email removed]');
  text = swap(TELEGRAM_LINK, text, () => '[link removed]');
  text = swap(URL, text, () => '[link removed]');
  text = swap(HANDLE, text, (_m, before) => `${before}[username removed]`);
  for (const pattern of PHONES) {
    text = text.replace(pattern, (match) => {
      if (!looksLikePhone(match)) return match;
      removed++;
      return '[phone removed]';
    });
  }
  text = swap(MY_NAME, text, (_m, lead) => `${lead} [name]`);
  text = swap(SIGN_OFF, text, (_m, closing, gap) => `${closing},${gap.includes('\n') ? '\n' : ' '}[Name]`);
  return { text, removed };
}
