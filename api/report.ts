import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { initFirebase, getUid, currentDayKey, resolvePaidStatus } from './_lib/shared.js';

/**
 * User feedback and crash reports: saved to Firestore, then pushed to Telegram
 * so a solo admin actually sees them.
 *
 * Sign-in is optional on purpose. A crash often happens before the user is
 * logged in, or is the very thing that broke their session — requiring auth
 * here would silently drop exactly the reports worth having.
 */

const TELEGRAM_LIMIT = 4096; // Telegram rejects anything longer
const MAX_MESSAGE = 2000; // what we accept from the user
const DAILY_REPORT_LIMIT = 5; // per account, or per IP when signed out

type ReportType = 'crash' | 'bug' | 'idea' | 'other' | 'rating';
const TYPES: ReportType[] = ['crash', 'bug', 'idea', 'other', 'rating'];

const LABEL: Record<ReportType, string> = {
  crash: '🔴 CRASH',
  bug: '🐞 BUG',
  idea: '💡 IDEA',
  other: '💬 FEEDBACK',
  rating: '⭐ RATING',
};

/** Telegram HTML mode only needs these three escaped. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function sendToTelegram(html: string): Promise<void> {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId) {
    console.error('report: TELEGRAM_TOKEN or CHAT_ID is not set — report saved to Firestore only');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: clip(html, TELEGRAM_LIMIT),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) console.error('report: Telegram rejected the message:', await res.text());
}

/**
 * One report bucket per day, keyed by account when signed in and by a hashed IP
 * when not. Returns false once the bucket is full. The IP is hashed so a raw
 * address is never stored next to a user's words.
 */
async function withinDailyLimit(key: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection('report_limits').doc(key);
  const dayKey = currentDayKey();
  let allowed = true;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.data() ?? {}) as { dayKey?: string; count?: number };
    const used = d.dayKey === dayKey ? (d.count ?? 0) : 0;
    if (used >= DAILY_REPORT_LIMIT) { allowed = false; return; }
    tx.set(ref, { dayKey, count: used + 1 }, { merge: true });
  });
  return allowed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  const body = (req.body ?? {}) as {
    type?: string;
    message?: string;
    page?: string;
    rating?: string;
    error?: string;
    stack?: string;
  };

  const type = (TYPES as string[]).includes(body.type ?? '') ? (body.type as ReportType) : 'other';
  const message = clip(String(body.message ?? '').trim(), MAX_MESSAGE);
  const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : null;

  // A rating is one tap and carries no words; everything else must say something.
  if (!message && !rating && type !== 'crash') {
    return res.status(400).json({ error: 'Please write a short message.' });
  }

  // Signed in where possible, anonymous where not.
  let uid: string | null = null;
  try { uid = await getUid(req); } catch { /* anonymous report — still worth having */ }

  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ipHash = forwarded ? createHash('sha256').update(forwarded).digest('hex').slice(0, 16) : 'unknown';

  try {
    if (!(await withinDailyLimit(uid ? `uid_${uid}` : `ip_${ipHash}`))) {
      return res.status(429).json({ error: `You have sent ${DAILY_REPORT_LIMIT} reports today. Thank you — please try again tomorrow.` });
    }
  } catch (e) {
    console.error('report: rate-limit check failed, letting it through:', e);
  }

  // Who is this, in a form that is useful in a Telegram notification?
  const db = getFirestore();
  let who = 'not signed in';
  if (uid) {
    try {
      const snap = await db.collection('users').doc(uid).get();
      const d = snap.data() ?? {};
      const status = resolvePaidStatus(d);
      const name = (d.fullName as string) || (d.email as string) || uid.slice(0, 8);
      who = `${name} · ${status.isCenterStudent ? `centre: ${d.centerName ?? '?'}` : status.plan}`;
    } catch {
      who = uid.slice(0, 8);
    }
  }

  const page = clip(String(body.page ?? '').trim(), 200);
  const userAgent = clip(String(req.headers['user-agent'] ?? ''), 200);
  const errorText = clip(String(body.error ?? '').trim(), 500);
  const stack = clip(String(body.stack ?? '').trim(), 900);

  try {
    await db.collection('user_reports').add({
      type, message, rating, page, userAgent,
      error: errorText || null,
      stack: stack || null,
      uid: uid ?? null,
      ipHash,
      handled: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // Telegram is the delivery that matters most — keep going even if the
    // database write fails, so the report is not lost entirely.
    console.error('report: Firestore write failed:', e);
  }

  const lines = [
    `<b>${LABEL[type]}</b>`,
    '',
    `<b>Who:</b> ${esc(who)}`,
    page ? `<b>Page:</b> ${esc(page)}` : '',
    rating ? `<b>Rating:</b> ${rating === 'up' ? '👍 useful' : '👎 not useful'}` : '',
    message ? `\n${esc(message)}` : '',
    errorText ? `\n<b>Error:</b>\n<code>${esc(errorText)}</code>` : '',
    stack ? `<pre>${esc(stack)}</pre>` : '',
    userAgent ? `\n<i>${esc(userAgent)}</i>` : '',
  ].filter(Boolean);

  try {
    await sendToTelegram(lines.join('\n'));
  } catch (e) {
    console.error('report: Telegram send failed:', e);
  }

  return res.status(200).json({ ok: true });
}
