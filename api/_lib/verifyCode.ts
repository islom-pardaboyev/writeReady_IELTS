/**
 * Score-card verification details that the site and the API must agree on.
 * No imports, so both builds can use it (the site through @shared).
 */

/** Where a verification lives. The QR code and the printed line both point here. */
export const VERIFY_BASE = 'https://writeready.uz/v/';

/** When a student leaves the name empty. */
export const DEFAULT_CARD_NAME = 'IELTS candidate';

export const MAX_CARD_NAME = 40;

/**
 * The name exactly as a card prints it and a verification stores it. The
 * card and the server both use this, so the name on the page a QR code opens
 * always matches the name on the card.
 */
export function cleanCardName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    // Control and format characters: invisible, or able to reorder text.
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CARD_NAME)
    .trim();
  return cleaned || DEFAULT_CARD_NAME;
}

/**
 * Codes use Crockford's base 32: digits and capitals without I, L, O and U,
 * so a code read aloud or typed from paper cannot be mistaken.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;

/** "7F3K9Q2M" as printed: "7F3K-9Q2M". */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** A code as someone typed it, cleaned up, or null when it cannot be one. */
export function parseCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/** The address a code opens. Capitals, so a QR code can use its compact mode. */
export function verifyUrl(code: string): string {
  return `${VERIFY_BASE}${code}`.toUpperCase();
}
