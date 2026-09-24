import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initFirebase, getUid } from './_lib/shared.js';
import {
  VerificationError, activateVerification, buildVerification, listVerifications, readVerification, revokeVerification,
  type Verification,
} from './_lib/verification.js';
import { parseCode, verifyUrl } from './_lib/verifyCode.js';

/**
 * Score-card verification.
 *
 *   GET  ?code=7F3K9Q2M                  public: what the card's QR code opens
 *   POST { action: 'prepare', ... }      the code a card would carry, saves nothing
 *   POST { action: 'activate', ... }     saves it, so the code works (on download)
 *   POST { action: 'list' }              the student's live verifications
 *   POST { action: 'revoke', code }      withdraws one of them
 *
 * POST needs the student's Firebase ID token. See api/_lib/verification.ts.
 */

/** What the public page may show: never the account id or the report ids. */
function publicView(v: Verification, issuedAt: string) {
  return {
    code: v.code,
    name: v.name,
    kind: v.kind,
    tasks: v.tasks,
    writing: v.writing,
    issuedAt,
  };
}

const ERRORS: Record<VerificationError['code'], [number, string]> = {
  BAD_INPUT: [400, 'That card could not be read. Please reload the report and try again.'],
  NOT_FOUND: [404, 'This report is no longer in your history, so it cannot be verified.'],
  NOT_OWNER: [403, 'You can only verify your own reports.'],
  UNSIGNED: [409, 'This report was made before verification existed. Reports you get from now on can be verified.'],
  MISMATCH: [400, 'A full test needs one Task 1 report and one Task 2 report.'],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // A verification is someone's name and score: never for search engines.
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.NONCE_SECRET) {
    console.error('verify: NONCE_SECRET is not set');
    return res.status(500).json({ error: 'Verification is not set up correctly. Please contact @writeready_admin on Telegram.' });
  }
  try { initFirebase(); } catch (e) {
    console.error('verify: Firebase init failed:', e);
    return res.status(500).json({ error: 'The server could not start. Please try again shortly.' });
  }

  if (req.method === 'GET') {
    const code = parseCode(typeof req.query.code === 'string' ? req.query.code : '');
    if (!code) return res.status(404).json({ status: 'not_found' });
    try {
      const result = await readVerification(code);
      // A short CDN cache keeps a card that goes viral from costing a
      // database read per view; a withdrawal still shows within a minute.
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      if (result.status === 'valid') {
        return res.status(200).json({ status: 'valid', ...publicView(result.verification, result.issuedAt) });
      }
      return res.status(result.status === 'revoked' ? 200 : 404).json({ status: result.status });
    } catch (e) {
      console.error('verify: read failed:', e);
      return res.status(503).json({ error: 'Verification is unavailable right now. Please try again shortly.' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const { action, reportIds, name, code } = req.body ?? {};
  try {
    if (action === 'prepare' || action === 'activate') {
      const v = await buildVerification(uid, reportIds, name);
      if (action === 'activate') await activateVerification(v);
      return res.status(200).json({ code: v.code, url: verifyUrl(v.code), name: v.name, active: action === 'activate' });
    }
    if (action === 'list') {
      const items = await listVerifications(uid);
      return res.status(200).json({ items: items.map((i) => publicView(i.verification, i.issuedAt)) });
    }
    if (action === 'revoke') {
      const parsed = parseCode(typeof code === 'string' ? code : '');
      if (!parsed || !(await revokeVerification(uid, parsed))) return res.status(404).json({ error: 'That verification was not found.' });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    if (e instanceof VerificationError) {
      const [status, message] = ERRORS[e.code];
      return res.status(status).json({ error: message, code: e.code });
    }
    console.error('verify: failed:', e);
    return res.status(503).json({ error: 'Verification is unavailable right now. Please try again shortly.' });
  }
}
