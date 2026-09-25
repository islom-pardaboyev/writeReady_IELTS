import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initFirebase, getUid } from '../shared.js';
import { openLink } from '../studentBot.js';

/**
 * The Telegram bot's links (src/pages/TelegramLinkPage.tsx). A signed-in
 * student sends the link's code; this connects their Telegram to their site
 * account and, for a "See full feedback" link, returns the essay it holds
 * (openLink in api/_lib/studentBot.ts).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e) {
    console.error('bot-link: Firebase init failed:', e);
    return res.status(500).json({ error: 'The server could not start. Please try again shortly.' });
  }
  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const code = (req.body ?? {}).code;
  if (typeof code !== 'string') return res.status(400).json({ error: 'The link is incomplete.' });
  try {
    const opened = await openLink(code, uid);
    if (opened === 'not-ready') {
      return res.status(409).json({ error: 'Your account is still being set up. Wait a few seconds, then reload this page.' });
    }
    if (!opened) {
      return res.status(404).json({ error: 'This link was already opened, or it has expired. Each link opens once: for a new one, go back to the Telegram bot.' });
    }
    return res.status(200).json(opened);
  } catch (e) {
    console.error('bot-link: could not open the link:', e);
    return res.status(500).json({ error: 'Could not open the link. Please try again.' });
  }
}
