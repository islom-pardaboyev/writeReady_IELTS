import { timingSafeEqual } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { esc, tg, tgUpload, TelegramError } from '../telegramApi.js';
import { CAPTION_LIMIT } from '../telegramText.js';
import {
  CHARTS, MODE_LABEL, QUEUE, SAMPLES, SUBMISSIONS,
  type Criteria, type SampleMode, type SampleStatus, type SampleTaskType, type SampleVocab,
} from './model.js';

/**
 * The admin's one job: Approve or Reject in Telegram.
 *
 * Every new student share and every new AI draft goes to ADMIN_TELEGRAM_CHAT_ID
 * through @writeready_student_bot. A Task 1 sample starts with its chart
 * (sendPhoto, or sendDocument for a PDF) captioned with the header, and the
 * essay follows as a reply to it. A long essay is split over several
 * messages; the buttons sit on the last one.
 *
 * A press edits that message to say what happened and removes the buttons,
 * so nothing can be pressed twice; the change itself runs in a transaction
 * that only acts on a sample still 'pending', so a press Telegram delivers
 * twice is harmless too.
 */

/** Room under Telegram's 4096 for the "✅ Published" line a press adds. */
export const CHUNK_LIMIT = 3900;

/**
 * Where samples go: ADMIN_TELEGRAM_CHAT_ID, or, when it is not set, the first
 * id in TELEGRAM_ADMIN_IDS (the bot's /admin list). For an admin who chats
 * with the bot privately the two are the same number.
 */
export function adminChatId(): string {
  const chat = (process.env.ADMIN_TELEGRAM_CHAT_ID ?? '').trim();
  return chat || (adminUserIds()[0] ?? '');
}

/** TELEGRAM_ADMIN_IDS, the same list api/_lib/studentBot.ts uses for /admin. */
function adminUserIds(): string[] {
  return (process.env.TELEGRAM_ADMIN_IDS ?? '').split(',').map((id) => id.trim()).filter((id) => /^-?\d{1,20}$/.test(id));
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Whether a button press may change a sample: it has to come from the admin
 * chat, and from the admin. In a private chat with the bot the chat id is the
 * admin's own user id; in a group, the presser must be in TELEGRAM_ADMIN_IDS.
 */
export function pressAllowed(chatId: number | string | undefined, fromId: number | string | undefined): boolean {
  const admin = adminChatId();
  if (!admin || chatId === undefined || fromId === undefined) return false;
  if (!same(String(chatId), admin)) return false;
  return same(String(fromId), admin) || adminUserIds().includes(String(fromId));
}

// ── The message ──────────────────────────────────────────────────────────────

interface ReviewSample {
  taskType: SampleTaskType;
  questionId: string;
  questionText: string;
  sourceType: 'student' | 'ai';
  sampleAnswer: string;
  band: number;
  criteria: Criteria | null;
  wordCount: number;
  vocabulary: SampleVocab[];
  mode?: SampleMode;
  status: SampleStatus;
  review?: { consentId?: string; buttonHtml?: string };
}

const fmtBand = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The lines every review message starts with. Plain text: escaped by the caller. */
export function headerLines(s: ReviewSample): string[] {
  const task = s.taskType === 'task1' ? 'Task 1' : 'Task 2';
  const lines = [
    s.sourceType === 'student' ? `🎓 Student answer — Band ${fmtBand(s.band)}` : `🤖 AI model answer — Band ${fmtBand(s.band)}`,
  ];
  if (s.sourceType === 'ai' || !s.criteria) {
    lines.push('AI draft — not assessed');
  } else {
    const c = s.criteria;
    lines.push(`${s.taskType === 'task1' ? 'TA' : 'TR'} ${fmtBand(c.taskScore)} | CC ${fmtBand(c.cc)} | LR ${fmtBand(c.lr)} | GRA ${fmtBand(c.gra)}`);
  }
  const meta = [task];
  if (s.sourceType === 'student' && s.mode) meta.push(MODE_LABEL[s.mode]);
  meta.push(`${s.wordCount} words`);
  lines.push(meta.join(' • '));
  // A mock or practice test holds both tasks; the code shows which messages
  // came from the same student's test.
  if (s.sourceType === 'student' && (s.mode === 'mock' || s.mode === 'practice')) {
    lines.push(`${task} of 2 • #${s.review?.consentId ?? '------'}`);
  }
  return lines;
}

/**
 * Splits HTML lines into messages under the limit, never inside a line's
 * tags. A line too long on its own (one huge paragraph) is split at spaces
 * as plain text first and escaped after, so an entity is never cut in half.
 */
export function chunkLines(lines: { html?: string; plain?: string }[], limit = CHUNK_LIMIT): string[] {
  const pieces: string[] = [];
  for (const line of lines) {
    const html = line.html ?? esc(line.plain ?? '');
    if (html.length <= limit) {
      pieces.push(html);
      continue;
    }
    let rest = line.plain ?? html.replace(/<[^>]+>/g, '');
    while (rest) {
      let cut = rest.length;
      while (esc(rest.slice(0, cut)).length > limit) {
        const space = rest.lastIndexOf(' ', Math.floor(cut * 0.9));
        cut = space > 0 ? space : Math.floor(cut * 0.9);
      }
      pieces.push(esc(rest.slice(0, cut)));
      rest = rest.slice(cut).trimStart();
    }
  }
  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const next = current ? `${current}\n${piece}` : piece;
    if (next.length > limit && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function reviewMessages(s: ReviewSample, { headerInCaption }: { headerInCaption: boolean }): { caption: string; chunks: string[] } {
  const header = headerLines(s);
  const caption = clip(header.map(esc).join('\n'), CAPTION_LIMIT - 10);
  const lines: { html?: string; plain?: string }[] = [];
  // The essay of a Task 1 replies to the chart, whose caption is the header;
  // the first line still says which sample it is, for a glance at the chat list.
  if (headerInCaption) lines.push({ html: `<b>${esc(header[0])}</b>` });
  else lines.push(...header.map((h, i) => ({ html: i === 0 ? `<b>${esc(h)}</b>` : esc(h) })));
  lines.push({ html: '' }, { html: '<b>Question</b>' });
  for (const p of s.questionText.split(/\n+/)) lines.push({ plain: p });
  lines.push({ html: '' }, { html: '<b>Essay</b>' });
  for (const p of s.sampleAnswer.split(/\n+/)) lines.push({ plain: p }, { html: '' });
  if (s.vocabulary.length) {
    lines.push({ html: '<b>Vocabulary</b>' });
    for (const v of s.vocabulary) lines.push({ html: `• ${esc(v.word)} — <i>${esc(v.uz)}</i>` });
  }
  while (lines.length && lines[lines.length - 1].html === '') lines.pop();
  return { caption, chunks: chunkLines(lines) };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export const buttons = (id: string, sourceType: 'student' | 'ai') => ({
  inline_keyboard: [[
    { text: '✅ Approve', callback_data: `smp:a:${id}` },
    { text: '❌ Reject', callback_data: `smp:r:${id}` },
    ...(sourceType === 'ai' ? [{ text: '🔁 Regenerate', callback_data: `smp:g:${id}` }] : []),
  ]],
});

/** The chart as a file to upload: Telegram gets the bytes, so no public address is needed yet. */
async function loadChart(questionId: string): Promise<{ data: Buffer; type: string; ext: string } | null> {
  const snap = await db().collection(CHARTS).doc(questionId).get();
  const raw = snap.exists ? snap.get('data') : undefined;
  if (typeof raw !== 'string') return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/is.exec(raw);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg';
  return { data: Buffer.from(m[2], 'base64'), type, ext };
}

/**
 * Sends one sample to the admin chat and remembers the messages on it. A
 * sample whose messages went out already is left alone, so the cron can call
 * this for every pending sample without sending anything twice.
 */
export async function sendForReview(sampleId: string): Promise<boolean> {
  const chatId = adminChatId();
  if (!chatId) {
    console.error('samples: neither ADMIN_TELEGRAM_CHAT_ID nor TELEGRAM_ADMIN_IDS is set; the sample waits until one is');
    return false;
  }
  const ref = db().collection(SAMPLES).doc(sampleId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const s = snap.data() as ReviewSample & { review?: { sentAt?: unknown } };
  if (s.status !== 'pending' || s.review?.sentAt) return false;

  let replyTo: number | undefined;
  const messageIds: number[] = [];
  if (s.taskType === 'task1') {
    const chart = await loadChart(s.questionId).catch(() => null);
    const caption = reviewMessages(s, { headerInCaption: true }).caption;
    if (chart) {
      const isPdf = chart.ext === 'pdf';
      const sent = await tgUpload<{ message_id: number }>(
        isPdf ? 'sendDocument' : 'sendPhoto',
        { chat_id: chatId, caption, parse_mode: 'HTML' },
        { field: isPdf ? 'document' : 'photo', name: `chart-${s.questionId}.${chart.ext}`, type: chart.type, data: chart.data },
      );
      replyTo = sent.message_id;
      messageIds.push(sent.message_id);
    }
  }

  const { chunks } = reviewMessages(s, { headerInCaption: replyTo !== undefined });
  if (s.taskType === 'task1' && replyTo === undefined) chunks[0] = `⚠️ <i>The chart could not be loaded.</i>\n${chunks[0]}`;
  let buttonMessageId = 0;
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    const sent = await tg<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(i === 0 && replyTo !== undefined ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      ...(last ? { reply_markup: buttons(sampleId, s.sourceType) } : {}),
    });
    messageIds.push(sent.message_id);
    if (last) buttonMessageId = sent.message_id;
  }

  await ref.set({
    review: {
      chatId,
      messageIds,
      buttonMessageId,
      // Kept so a press can rewrite this message with its formatting intact.
      buttonHtml: chunks[chunks.length - 1],
      sentAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  return true;
}

// ── A press ──────────────────────────────────────────────────────────────────

export interface ReviewCallback {
  id: string;
  from: { id: number };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
}

const ACTIONS = { a: 'approve', r: 'reject', g: 'regenerate' } as const;
type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export function readPress(data: string | undefined): { action: Action; sampleId: string } | null {
  const m = /^smp:([arg]):([\w-]{1,40})$/.exec(data ?? '');
  return m ? { action: ACTIONS[m[1] as keyof typeof ACTIONS], sampleId: m[2] } : null;
}

type Outcome = { kind: 'done'; label: string } | { kind: 'already'; status: string } | { kind: 'missing' } | { kind: 'refused'; reason: string };

/** Applies a press to the sample. Exported for scripts/test-samples.ts. */
export async function applyPress(action: Action, sampleId: string): Promise<Outcome> {
  const store = db();
  const ref = store.collection(SAMPLES).doc(sampleId);
  return store.runTransaction(async (tx): Promise<Outcome> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: 'missing' };
    const s = snap.data() as { status: SampleStatus; sourceType: string; questionId: string; submissionId?: string };
    if (s.status !== 'pending') return { kind: 'already', status: s.status };
    if (action === 'regenerate' && s.sourceType !== 'ai') return { kind: 'refused', reason: 'Only AI drafts can be regenerated.' };
    const now = FieldValue.serverTimestamp();
    const status: SampleStatus = action === 'approve' ? 'published' : 'rejected';
    tx.set(ref, {
      status,
      updatedAt: now,
      ...(status === 'published' ? { publishedAt: now, pageChangedAt: now } : { rejectedAt: now }),
      ...(action === 'regenerate' ? { regenerated: true } : {}),
    }, { merge: true });
    if (s.submissionId) tx.set(store.collection(SUBMISSIONS).doc(s.submissionId), { status, updatedAt: now }, { merge: true });
    if (action === 'regenerate') {
      tx.set(store.collection(QUEUE).doc(s.questionId), { kind: 'regenerate', requestedAt: now, replaces: sampleId });
    }
    return {
      kind: 'done',
      label: action === 'approve' ? '✅ Published' : action === 'reject' ? '❌ Rejected' : '🔁 Rejected — a new draft is queued',
    };
  });
}

const STATUS_LABEL: Record<string, string> = {
  published: '✅ Published',
  rejected: '❌ Rejected',
  needs_manual: '⚠️ Needs manual review',
};

/**
 * Handles a press on a review button. Returns false when the update is not
 * one of ours, so the student bot gets it as before.
 */
export async function handleReviewPress(cb: ReviewCallback): Promise<boolean> {
  const press = readPress(cb.data);
  if (!press) return false;
  const answer = (text: string) =>
    tg('answerCallbackQuery', { callback_query_id: cb.id, text }).catch(() => {});

  const chatId = cb.message?.chat.id;
  if (!pressAllowed(chatId, cb.from.id)) {
    console.error(`samples: refused a review press from ${cb.from.id} in chat ${chatId}`);
    await answer('Not allowed.');
    return true;
  }

  let outcome: Outcome;
  try {
    outcome = await applyPress(press.action, press.sampleId);
  } catch (e) {
    console.error(`samples: ${press.action} on ${press.sampleId} failed:`, e);
    await answer('Something went wrong. Try again.');
    return true;
  }

  const label = outcome.kind === 'done' ? outcome.label
    : outcome.kind === 'already' ? STATUS_LABEL[outcome.status] ?? outcome.status
    : outcome.kind === 'missing' ? '⚠️ This sample no longer exists'
    : null;
  if (outcome.kind === 'refused') {
    await answer(outcome.reason);
    return true;
  }

  // Rewrite the message with the result and without buttons. The stored HTML
  // keeps its formatting; without it, the buttons alone go.
  const messageId = cb.message!.message_id;
  const snap = await db().collection(SAMPLES).doc(press.sampleId).get().catch(() => null);
  const html = snap?.exists ? snap.get('review.buttonHtml') : undefined;
  try {
    if (typeof html === 'string' && html) {
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `${html}\n\n<b>${esc(label ?? '')}</b>`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } else {
      await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    }
  } catch (e) {
    // "message is not modified" when Telegram delivers the same press twice.
    if (!(e instanceof TelegramError && e.code === 400)) console.error('samples: could not update the review message:', e);
  }
  await answer(label ?? 'Done');
  return true;
}
