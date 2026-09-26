import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from 'firebase-admin/auth';
import { initFirebase } from '../shared.js';
import {
  BroadcastError, audience, readPhoto, readPost, recentBroadcasts, runBroadcast, sendTest, startBroadcast,
} from '../broadcast.js';

/**
 * The admin panel's Telegram bot section (src/pages/writing/admin/TelegramBotSection.tsx):
 * posts to every bot student (api/_lib/broadcast.ts). Admin only: the request
 * carries a Firebase ID token for the admin account minted in
 * api/staff-login.ts, checked the same way as api/maintenance.ts.
 *
 * POST { action }:
 *   overview  who a post would reach, and the recent posts
 *   test      send the post to the admin's own Telegram; uploads its picture
 *   send      record the post and send it to everyone, streaming progress
 *   continue  carry on a post that paused, streaming progress
 */
const ADMIN_EMAIL = 'admin@writeready.internal';
/** How long one request sends before pausing; the function may run 300 s (vercel.json). */
const RUN_MS = 240_000;

async function isAdmin(req: VercelRequest): Promise<boolean | null> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return (await getAuth().verifyIdToken(token)).email === ADMIN_EMAIL;
  } catch {
    return null;
  }
}

/**
 * Sends and writes one line of JSON per step (NDJSON), so the panel shows a
 * live progress bar from this one request, without asking again and again.
 */
async function streamRun(res: VercelResponse, id: string): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const line = (value: unknown) => res.write(`${JSON.stringify(value)}\n`);
  try {
    const result = await runBroadcast(id, Date.now() + RUN_MS, (p) => line(p));
    line({ ...result, final: true });
  } catch (e) {
    console.error('bot-broadcast: sending stopped:', e);
    line({ final: true, error: e instanceof BroadcastError ? e.message : 'Sending stopped. It carries on by itself within the hour.' });
  }
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try { initFirebase(); } catch (e) {
    console.error('bot-broadcast: Firebase init failed:', e);
    return res.status(500).json({ error: 'The server could not start. Please try again shortly.' });
  }
  const admin = await isAdmin(req);
  if (admin === null) return res.status(401).json({ error: 'Please sign in to the admin panel again.' });
  if (!admin) return res.status(403).json({ error: 'Admin only.' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    switch (body.action) {
      case 'overview': {
        const [reach, recent] = await Promise.all([audience(), recentBroadcasts()]);
        return res.status(200).json({ audience: reach, recent });
      }
      case 'test': {
        const upload = readPhoto(body.photo);
        const post = readPost(body, { photoComing: upload !== null });
        return res.status(200).json(await sendTest(post, upload));
      }
      case 'send': {
        const post = readPost(body);
        const id = String(body.id ?? '');
        await startBroadcast(id, post);
        return streamRun(res, id);
      }
      case 'continue':
        return streamRun(res, String(body.id ?? ''));
      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }
  } catch (e) {
    if (e instanceof BroadcastError) return res.status(400).json({ error: e.message });
    console.error('bot-broadcast: failed:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
