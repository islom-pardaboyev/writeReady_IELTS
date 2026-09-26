import { FieldPath, type Query } from 'firebase-admin/firestore';
import { db } from './db.js';
import { tg, tgUpload, TelegramError, type Upload } from './telegramApi.js';
import { BOT_USERS, adminIds, type BotUser } from './studentBot.js';
import { postProblem, postToHtml, type PostButton } from './telegramText.js';

/**
 * Posts the admin sends to every student who uses the Telegram bot, from the
 * admin panel (src/pages/writing/admin/TelegramBotSection.tsx, through
 * api/_lib/routes/botBroadcast.ts).
 *
 * A post goes to the admin first (sendTest), which also uploads its picture
 * once. Sending to everyone then walks bot_users in id order, saving how far
 * it got every few messages, so a send cut short by the server's time limit
 * carries on from there: from the panel, or by itself within the hour
 * (continueBroadcasts, run by the hourly job). A lease on the post keeps two
 * of these from ever sending it at the same time.
 *
 * Every post carries a "Stop announcements" button. Students who pressed it,
 * or who blocked the bot, are skipped.
 */

export const BROADCASTS = 'bot_broadcasts';

const PAGE = 50;
/** Progress is saved this often, so a send cut short repeats at most this many messages. */
const SAVE_EVERY = 10;
const LEASE_MS = 60_000;
/** Telegram allows about 30 messages a second to different chats; this stays under it. */
const GAP_MS = 40;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** A problem the admin can fix, shown to them as it is. */
export class BroadcastError extends Error {}

export interface Post {
  text: string;
  html: string;
  button: PostButton | null;
  /** Telegram's id for the picture, from the test send. */
  photoFileId: string | null;
}

export interface Progress {
  status: 'sending' | 'done';
  /** Students who could receive it when it started. */
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  /** Turned announcements off, or blocked the bot before. */
  skipped: number;
}

interface StoredBroadcast extends Progress {
  text: string;
  html: string;
  button: PostButton | null;
  photoFileId: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  /** The last student handled (bot_users id). */
  cursor: string;
  leaseUntil: number;
}

export interface BroadcastSummary extends Progress {
  id: string;
  text: string;
  hasPhoto: boolean;
  createdAt: number;
  finishedAt: number | null;
  /** Being sent right now. */
  active: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const progressOf = (b: Progress): Progress => ({
  status: b.status, total: b.total ?? 0, sent: b.sent ?? 0, failed: b.failed ?? 0, blocked: b.blocked ?? 0, skipped: b.skipped ?? 0,
});

// ── Reading what the admin sent ──────────────────────────────────────────────

/** The post in a request from the panel. Throws BroadcastError for anything Telegram would refuse. */
export function readPost(body: Record<string, unknown>, { photoComing = false } = {}): Post {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const raw = body.button as { text?: unknown; url?: unknown } | null | undefined;
  const button = raw && (raw.text || raw.url) ? { text: String(raw.text ?? '').trim(), url: String(raw.url ?? '').trim() } : null;
  const photoFileId = typeof body.photoFileId === 'string' && body.photoFileId ? body.photoFileId : null;
  const problem = postProblem({ text, button, hasPhoto: photoComing || photoFileId !== null });
  if (problem) throw new BroadcastError(problem);
  return { text, html: postToHtml(text), button, photoFileId };
}

/** A picture chosen in the panel, sent as base64. Null when there is none. */
export function readPhoto(value: unknown): Upload | null {
  if (!value) return null;
  const { name, type, base64 } = value as { name?: unknown; type?: unknown; base64?: unknown };
  if (typeof type !== 'string' || !PHOTO_TYPES.includes(type)) throw new BroadcastError('The picture must be a JPG, PNG or WebP image.');
  if (typeof base64 !== 'string' || !base64) throw new BroadcastError('The picture did not arrive. Choose it again.');
  const data = Buffer.from(base64, 'base64');
  if (data.length > MAX_PHOTO_BYTES) throw new BroadcastError('The picture is over 5 MB. Use a smaller one.');
  const safeName = typeof name === 'string' && /^[\w .-]{1,80}$/.test(name) ? name : 'picture';
  return { field: 'photo', name: safeName, type, data };
}

// ── Sending one message ──────────────────────────────────────────────────────

function keyboard(button: PostButton | null) {
  return {
    inline_keyboard: [
      ...(button ? [[{ text: button.text, url: button.url }]] : []),
      [{ text: '🔕 Stop announcements', callback_data: 'news:off' }],
    ],
  };
}

/** Sends the post to one chat. With a picture to upload, returns Telegram's id for it. */
async function deliver(chatId: number, post: Post, upload?: Upload | null): Promise<string | null> {
  const common = { chat_id: chatId, parse_mode: 'HTML', reply_markup: keyboard(post.button) };
  if (upload) {
    const message = await tgUpload<{ photo?: { file_id: string }[] }>('sendPhoto', { ...common, caption: post.html || undefined }, upload);
    // The last size is the biggest. (Index, not .at(): Vercel type-checks api/ against an older library.)
    const sizes = message.photo ?? [];
    return sizes[sizes.length - 1]?.file_id ?? null;
  }
  if (post.photoFileId) {
    await tg('sendPhoto', { ...common, photo: post.photoFileId, caption: post.html || undefined });
    return post.photoFileId;
  }
  await tg('sendMessage', { ...common, text: post.html });
  return null;
}

/**
 * Sends the post to the admins' own chats (TELEGRAM_ADMIN_IDS), exactly as
 * students will get it, and uploads its picture on the way. The panel sends
 * everyone the picture by the id this returns.
 */
export async function sendTest(post: Post, upload: Upload | null): Promise<{ photoFileId: string | null; sentTo: number }> {
  const ids = adminIds();
  if (!ids.length) {
    throw new BroadcastError('Add your Telegram ID to TELEGRAM_ADMIN_IDS in Vercel and redeploy. Send /account to the bot to see your ID.');
  }
  let current = post;
  let pending = upload;
  let sentTo = 0;
  for (const id of ids) {
    try {
      const fileId = await deliver(Number(id), current, pending);
      if (pending) {
        if (!fileId) throw new BroadcastError('Telegram did not accept the picture. Try another one.');
        current = { ...current, photoFileId: fileId };
        pending = null;
      }
      sentTo++;
    } catch (e) {
      if (e instanceof BroadcastError) throw e;
      if (e instanceof TelegramError && (e.unreachable || e.code === 400)) {
        console.error('broadcast: the test could not reach an admin:', e);
        continue;
      }
      throw e;
    }
  }
  if (!sentTo) throw new BroadcastError('The bot could not message you. Open @writeready_student_bot, press Start, then send the test again.');
  return { photoFileId: current.photoFileId, sentTo };
}

/** One student: sent, blocked (the bot can no longer write to them), or failed. */
async function deliverTo(user: BotUser, post: Post): Promise<'sent' | 'blocked' | 'failed'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await deliver(user.chatId, post);
      return 'sent';
    } catch (e) {
      if (e instanceof TelegramError && e.unreachable) {
        await db().collection(BOT_USERS).doc(user.telegramId).set({ blocked: true }, { merge: true }).catch(() => {});
        return 'blocked';
      }
      // Too many at once: Telegram says how long to wait. Once, then move on.
      if (e instanceof TelegramError && e.code === 429 && attempt === 0) {
        await sleep(Math.min(30, e.retryAfter ?? 3) * 1000);
        continue;
      }
      console.error('broadcast: one message failed:', e);
      return 'failed';
    }
  }
  return 'failed';
}

// ── Sending to everyone ──────────────────────────────────────────────────────

const count = async (q: Query) => (await q.count().get()).data().count;

/** Who a post would reach now. Count queries: a read per thousand students. */
export async function audience(): Promise<{ students: number; off: number; blocked: number; reach: number }> {
  const bots = db().collection(BOT_USERS);
  const [students, off, blocked, both] = await Promise.all([
    count(bots),
    count(bots.where('announcementsOff', '==', true)),
    count(bots.where('blocked', '==', true)),
    count(bots.where('announcementsOff', '==', true).where('blocked', '==', true)),
  ]);
  return { students, off, blocked, reach: students - off - blocked + both };
}

export async function recentBroadcasts(limit = 10): Promise<BroadcastSummary[]> {
  const snap = await db().collection(BROADCASTS).orderBy('createdAt', 'desc').limit(limit).get();
  const now = Date.now();
  return snap.docs.map((doc) => {
    const b = doc.data() as StoredBroadcast;
    return {
      id: doc.id,
      ...progressOf(b),
      text: (b.text ?? '').slice(0, 300),
      hasPhoto: Boolean(b.photoFileId),
      createdAt: b.createdAt,
      finishedAt: b.finishedAt ?? null,
      active: b.status === 'sending' && (b.leaseUntil ?? 0) > now,
    };
  });
}

/**
 * Records a post to send. `id` comes from the panel, one per press of the
 * button, so pressing it twice, or the request arriving twice, still makes
 * one post. Only one post is sent at a time.
 */
export async function startBroadcast(id: string, post: Post): Promise<void> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new BroadcastError('The request was incomplete. Reload the page and try again.');
  const ref = db().collection(BROADCASTS).doc(id);
  if ((await ref.get()).exists) return;
  const busy = await db().collection(BROADCASTS).where('status', '==', 'sending').limit(1).get();
  if (!busy.empty) throw new BroadcastError('Another post is still being sent. Wait for it to finish first.');
  const { reach } = await audience();
  await db().runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    const now = Date.now();
    const stored: StoredBroadcast = {
      ...post, status: 'sending', total: reach, sent: 0, failed: 0, blocked: 0, skipped: 0,
      createdAt: now, updatedAt: now, cursor: '', leaseUntil: 0,
    };
    tx.set(ref, stored);
  });
}

/**
 * Sends a recorded post on from where it got to, until everyone has it or the
 * deadline passes (then it pauses, and the next run carries on). `busy` when
 * another run holds it right now.
 */
export async function runBroadcast(
  id: string,
  deadline: number,
  onProgress?: (p: Progress) => void,
): Promise<Progress & { paused: boolean; busy: boolean }> {
  const store = db();
  const ref = store.collection(BROADCASTS).doc(id);
  const taken = await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const b = snap.data() as StoredBroadcast;
    if (b.status !== 'sending' || (b.leaseUntil ?? 0) > Date.now()) return { b, busy: b.status === 'sending' };
    tx.set(ref, { leaseUntil: Date.now() + LEASE_MS }, { merge: true });
    return { b, busy: false };
  });
  if (!taken) throw new BroadcastError('That post was not found.');
  const { b } = taken;
  const p = progressOf(b);
  if (taken.busy || b.status !== 'sending') return { ...p, paused: false, busy: taken.busy };

  const post: Post = { text: b.text, html: b.html, button: b.button, photoFileId: b.photoFileId };
  let cursor = b.cursor ?? '';
  let unsaved = 0;
  const save = async (extra: Partial<StoredBroadcast> = {}) => {
    await ref.set({ ...p, cursor, leaseUntil: Date.now() + LEASE_MS, updatedAt: Date.now(), ...extra }, { merge: true });
    unsaved = 0;
    onProgress?.({ ...p });
  };

  for (;;) {
    let page = store.collection(BOT_USERS).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) {
      p.status = 'done';
      await save({ status: 'done', finishedAt: Date.now(), leaseUntil: 0 });
      return { ...p, paused: false, busy: false };
    }
    for (const doc of snap.docs) {
      if (Date.now() > deadline) {
        await save({ leaseUntil: 0 });
        return { ...p, paused: true, busy: false };
      }
      const user = doc.data() as BotUser;
      if (user.announcementsOff || user.blocked || typeof user.chatId !== 'number') {
        p.skipped++;
      } else {
        p[await deliverTo(user, post)]++;
        await sleep(GAP_MS);
      }
      cursor = doc.id;
      if (++unsaved >= SAVE_EVERY) await save();
    }
    if (unsaved) await save();
  }
}

/** Carries on any post a run left unfinished. Run by the hourly job. */
export async function continueBroadcasts(deadline: number): Promise<number> {
  const snap = await db().collection(BROADCASTS).where('status', '==', 'sending').get();
  let finished = 0;
  for (const doc of snap.docs) {
    if (Date.now() > deadline) break;
    const result = await runBroadcast(doc.id, deadline);
    if (result.status === 'done') finished++;
  }
  return finished;
}
