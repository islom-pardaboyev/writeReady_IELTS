import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Encryption and signatures for records only the server may write.
 *
 * Why this exists: the Firestore rules live in the console, and for a while
 * they let any signed-in student read and write any document. Saved reports
 * and verification records must stay private and honest under ANY rules, so
 * they do not rely on the rules at all:
 *
 *   - a saved report is sealed (AES-256-GCM): unreadable without the server
 *     key, and any change to it makes it fail to open;
 *   - a record anyone may read (a score lock, a verification) is signed
 *     (HMAC-SHA256): a forged or edited one fails the check and is ignored.
 *
 * Every key is derived from NONCE_SECRET with its own purpose label, so one
 * secret in Vercel covers them all and no key can stand in for another.
 * Rotating NONCE_SECRET makes existing sealed reports unreadable; they are
 * then treated as missing, and the student's next request is marked afresh.
 */

type Purpose = 'saved-report' | 'score-lock' | 'report-sig' | 'verification' | 'verification-code';

function key(purpose: Purpose): Buffer {
  const secret = process.env.NONCE_SECRET;
  // Never fall back to a default: a key written in the source code would let
  // anyone read saved reports and forge verifications.
  if (!secret) throw new Error('NONCE_SECRET is not set');
  return Buffer.from(hkdfSync('sha256', secret, 'writeready', purpose, 32));
}

/** Encrypts `value` as JSON. `bind` ties it to one document, so a sealed blob copied to another document will not open there. */
export function seal(value: unknown, bind: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('saved-report'), iv);
  cipher.setAAD(Buffer.from(bind));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The value `seal` stored, or null when it is missing, forged, edited or sealed for another document. */
export function unseal<T>(sealed: unknown, bind: string): T | null {
  if (typeof sealed !== 'string') return null;
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key('saved-report'), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(bind));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const text = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** A hex HMAC of `payload` under the key for `purpose`. */
export function sign(purpose: Purpose, payload: string): string {
  return createHmac('sha256', key(purpose)).update(payload).digest('hex');
}

/** Whether `sig` is the signature of `payload`, compared in constant time. */
export function verifySignature(purpose: Purpose, payload: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(sign(purpose, payload), 'hex'));
}

/** Raw HMAC bytes, for deriving short codes. */
export function hmacBytes(purpose: Purpose, payload: string): Buffer {
  return createHmac('sha256', key(purpose)).update(payload).digest();
}
