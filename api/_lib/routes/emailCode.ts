import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { initFirebase } from '../shared.js';
import { db } from '../db.js';
import { CodeError, sendCode, verifyCode, type Deps } from '../emailCode.js';

/**
 * POST /api/email-code
 *   { action: 'send', email }                      emails a 6-digit code
 *   { action: 'verify', email, code }              returns { customToken, created } for signInWithCustomToken
 *   { action: 'verify', email, code, password }    the same, for sign-up (a new account gets this password)
 *                                                  and for confirming the email of an existing password account
 *
 * The rules live in api/_lib/emailCode.ts. The codes and their limits are in
 * the email_codes and email_code_ips collections, which only this server
 * touches: the Firestore rules give browsers no access to them.
 *
 * Email goes out through Resend (RESEND_API_KEY, RESEND_FROM). Without a key,
 * local development prints the code in the terminal instead, and the live site
 * says email sign-in is not switched on.
 */

const DEFAULT_FROM = 'WriteReady <code@writeready.uz>';

/** RESEND_FROM as set in Vercel or .env; quotes pasted around it are dropped. */
function sender(): string {
  const raw = (process.env.RESEND_FROM ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  return raw || DEFAULT_FROM;
}

async function sendWithResend(email: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new CodeError(503, 'Email sign-in is not switched on yet. Use Google or your password for now.');
    }
    console.log(`email-code: no RESEND_API_KEY, so nothing was emailed. The code for ${email} is ${code}`);
    return;
  }

  const text = [
    `Your WriteReady sign-in code is ${code}`,
    '',
    'It works for 10 minutes. If you did not ask for it, ignore this email.',
    '',
    `WriteReady kirish kodingiz: ${code}. Kod 10 daqiqa amal qiladi.`,
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:420px">
  <p style="margin:0 0 12px">Your WriteReady sign-in code is</p>
  <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px;font-family:'Courier New',monospace">${code}</p>
  <p style="margin:0 0 16px;color:#475569">It works for 10 minutes. If you did not ask for it, ignore this email.</p>
  <p style="margin:0;color:#475569">WriteReady kirish kodingiz: <b>${code}</b>. Kod 10 daqiqa amal qiladi.</p>
</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender(),
      to: [email],
      subject: `${code} is your WriteReady sign-in code`,
      text,
      html,
    }),
  });
  if (!res.ok) {
    // Resend's own message says what is wrong (an unverified domain, a bad key).
    console.error(`email-code: Resend refused (${res.status}):`, await res.text().catch(() => ''));
    throw new Error(`Resend ${res.status}`);
  }
}

function clientIp(req: VercelRequest): string {
  return String(req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
}

/** The Firebase Auth side of the rules. Exported for scripts/test-email-code-auth.ts, which runs it on the Auth emulator. */
export function firebaseAuthDeps(): Deps['auth'] {
  const auth = getAuth();
  return {
    async getUserByEmail(email) {
      try {
        const u = await auth.getUserByEmail(email);
        return { uid: u.uid, disabled: u.disabled, emailVerified: u.emailVerified };
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/user-not-found') return null;
        throw e;
      }
    },
    async createUser(email, password) {
      return (await auth.createUser(password ? { email, password, emailVerified: true } : { email, emailVerified: true })).uid;
    },
    async claim(uid, password) {
      // No password chosen: the old one becomes one nobody knows. Not unlinked,
      // because unlinking the password also takes the email off the account.
      const hasPassword = !password && (await auth.getUser(uid)).providerData.some((p) => p.providerId === 'password');
      const next = password ?? (hasPassword ? randomBytes(24).toString('base64url') : undefined);
      await auth.updateUser(uid, { emailVerified: true, ...(next ? { password: next } : {}) });
      // Whoever set the old password may still be signed in somewhere.
      await auth.revokeRefreshTokens(uid);
    },
    createCustomToken: (uid) => auth.createCustomToken(uid),
  };
}

function firestoreDeps(): Deps {
  const store = db();
  return {
    now: () => Date.now(),
    send: sendWithResend,
    update: (collection, key, fn) =>
      store.runTransaction(async (tx) => {
        const ref = store.collection(collection).doc(key);
        const snap = await tx.get(ref);
        const { next, result } = fn(snap.exists ? (snap.data() as Record<string, unknown>) : null);
        if (next === null) tx.delete(ref);
        else if (next) tx.set(ref, next);
        return result;
      }),
    auth: firebaseAuthDeps(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    console.error('email-code: Firebase init failed:', e);
    return res.status(500).json({ error: 'The sign-in service could not start. Try again in a minute.' });
  }

  const { action, email, code, password } = req.body ?? {};
  try {
    const deps = firestoreDeps();
    if (action === 'send') {
      await sendCode(deps, email, clientIp(req));
      return res.status(200).json({ sent: true });
    }
    if (action === 'verify') {
      // A password means sign-up: the account is made with it once the code checks out.
      const { token, created } = await verifyCode(deps, email, code, password);
      return res.status(200).json({ customToken: token, created });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e: unknown) {
    if (e instanceof CodeError) return res.status(e.status).json({ error: e.message });
    console.error('email-code:', e);
    return res.status(500).json({ error: 'Something went wrong. Try again in a minute.' });
  }
}
