import { randomBytes } from 'crypto';
import { db } from './db.js';
import { currentMonthKey, currentWeekKey } from './shared.js';
import { LIMITS, essayKeys, loadScoreLock, saveScoreLock, type EssayKeys, type ScoreLock } from './savedReports.js';
import type { BandScores } from './bandScore.js';
import { tg, esc, botUsername, webhookSecret, TelegramError } from './telegramApi.js';
import { DAILY_WORDS } from './dailyWords.js';

/**
 * The student Telegram bot: the site's front door inside Telegram.
 *
 * A student sends a Task 2 question and essay and gets back the estimated
 * band, the four criterion bands and the 2-3 mistakes worth fixing first,
 * from the same marking as the site's free weekly report. A button opens the
 * essay on the site for the full report.
 *
 * Free checks: one a week, the same weekly free report the site gives. Until
 * the student connects their site account (by opening that button and
 * signing in) the week is counted on their Telegram account; after that it
 * is counted on the site account, so the two share it. Invites add extra
 * checks: when a friend checks their first essay, both get one.
 *
 * Everything here reads and writes through db(), so scripts/test-student-bot.ts
 * can run it against an in-memory stand-in, and Telegram through tg(), which
 * it can also stand in for.
 */

export const BOT_USERS = 'bot_users';
export const BOT_LINKS = 'bot_links';

/** The same allowance as the site's weekly free report (api/pre-check.ts). */
export const FREE_CHECKS_PER_WEEK = 1;
/** The most extra checks one student can earn from invites in a month. */
export const MAX_INVITE_REWARDS_PER_MONTH = 5;
/** Below this the bands would say little; the site's minimum for Task 2 is 250. */
export const MIN_WORDS = 50;
/** Hours (Tashkent time) a student can pick for the daily word. vercel.json has one cron job per hour. */
export const WORD_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

const SITE = 'https://www.writeready.uz';
const LINK_DAYS = 7;
/** A check that has shown no result for this long crashed; let the student try again. */
const STUCK_CHECK_MS = 3 * 60 * 1000;

type Step = 'idle' | 'question' | 'essay' | 'checking';

export interface BotUser {
  telegramId: string;
  chatId: number;
  firstName?: string;
  createdAt: number;
  /** The newest update handled, so one Telegram delivers twice is handled once. */
  lastUpdateId: number;
  step: Step;
  checkingAt?: number;
  question?: string;
  essay?: string;
  /** The site account, once the student has connected it. */
  uid?: string;
  /** This Telegram account's own weekly free check, used until an account is connected. */
  weekKey?: string;
  weekCount?: number;
  /** Extra checks earned from invites. */
  bonusChecks?: number;
  referredBy?: string;
  referralRewarded?: boolean;
  referralMonth?: { monthKey: string; count: number };
  /** Tashkent hour for the daily word, or null when it is off. */
  wordHour?: number | null;
  wordIndex?: number;
  lastWordDay?: string;
  checks?: number;
}

export interface MarkInput {
  question: string;
  essay: string;
  wordCount: number;
  /** Bands already fixed for this exact text: the check must show them. */
  lock: ScoreLock | null;
}

export interface Marked {
  scores: BandScores;
  topic: string;
  mistakes: string[];
  /** The model's JSON, as the site stores a report. */
  raw: string;
}

/** What the webhook plugs in: the AI marking, and saving to a connected student's history. */
export interface BotDeps {
  mark(input: MarkInput): Promise<Marked>;
  saveToAccount(uid: string, keys: EssayKeys, essay: string, marked: Marked): Promise<void>;
}

/** Asked of the AI after the essay, on top of the free report's usual scores. */
export const MISTAKES_INSTRUCTION =
  'For this check, add one more field after "scores": "topMistakes", an array of the 2 or 3 problems that cost this essay the most, most important first. ' +
  "Each is one short sentence in plain English that the student can act on, quoting the student's own words where that helps. " +
  'It is extra to the structure above, and it never changes the scores.';

// ── Small helpers ────────────────────────────────────────────────────────────

type Button = { text: string; data?: string; url?: string };

const keyboard = (rows: Button[][]) => ({
  inline_keyboard: rows.map((row) =>
    row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))),
});

async function send(chatId: number, html: string, rows?: Button[][]): Promise<void> {
  await tg('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(rows ? { reply_markup: keyboard(rows) } : {}),
  });
}

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Today in Tashkent (UTC+5, no daylight saving), as yyyy-mm-dd. */
export function tashkentDay(now = new Date()): string {
  return new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

const userRef = (telegramId: string) => db().collection(BOT_USERS).doc(telegramId);

const MENU: Button[][] = [
  [{ text: '✍️ Check my essay', data: 'check' }],
  [{ text: '🎁 Invite friends', data: 'invite' }, { text: '📚 Daily word', data: 'word' }],
  [{ text: '🌐 Open WriteReady', url: SITE }],
];
const CANCEL: Button[][] = [[{ text: 'Cancel', data: 'cancel' }]];

// ── Updates ──────────────────────────────────────────────────────────────────

interface TgUser { id: number; is_bot?: boolean; first_name?: string }
interface TgMessage { chat: { id: number; type: string }; from?: TgUser; text?: string }
interface TgCallback { id: string; from: TgUser; data?: string; message?: { chat: { id: number } } }
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallback }

/**
 * Records that this update is being handled and returns the student, or
 * null when Telegram already delivered it (it sends again if a reply was slow).
 */
async function claim(updateId: number, from: TgUser, chatId: number): Promise<{ user: BotUser; isNew: boolean } | null> {
  const ref = userRef(String(from.id));
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const base = { chatId, firstName: from.first_name ?? '', lastUpdateId: updateId };
    if (!snap.exists) {
      const user: BotUser = { telegramId: String(from.id), createdAt: Date.now(), step: 'idle', ...base };
      tx.set(ref, user);
      return { user, isNew: true };
    }
    const existing = snap.data() as BotUser;
    if ((existing.lastUpdateId ?? -1) >= updateId) return null;
    tx.set(ref, base, { merge: true });
    return { user: { ...existing, ...base }, isNew: false };
  });
}

export async function handleUpdate(update: TgUpdate, deps: BotDeps): Promise<void> {
  const callback = update.callback_query;
  const message = update.message;
  const from = callback?.from ?? message?.from;
  const chatId = callback?.message?.chat.id ?? message?.chat.id;
  // Private chats only: the bot is one student's own tool, never a group's.
  if (!from || from.is_bot || chatId === undefined || (message && message.chat.type !== 'private')) return;

  const claimed = await claim(update.update_id, from, chatId);
  if (!claimed) return;
  const { user, isNew } = claimed;

  if (callback) {
    await tg('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
    await onButton(user, callback.data ?? '', deps);
    return;
  }
  const text = message?.text?.trim();
  if (!text) {
    await send(chatId, 'Please send your question and essay as text messages.');
    return;
  }
  await onText(user, text, isNew);
}

async function onText(user: BotUser, text: string, isNew: boolean): Promise<void> {
  const command = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  if (command === '/start') return welcome(user, text.split(/\s+/)[1] ?? '', isNew);
  if (command === '/check') return startCheck(user);
  if (command === '/invite') return invite(user);
  if (command === '/word') return wordSettings(user);
  if (command === '/cancel') return cancel(user);
  if (command === '/help' || command) return help(user);

  const step = user.step === 'checking' && Date.now() - (user.checkingAt ?? 0) > STUCK_CHECK_MS ? 'essay' : user.step;
  if (step === 'question') return takeQuestion(user, text);
  if (step === 'essay') return takeEssay(user, text);
  if (step === 'checking') return send(user.chatId, 'Still checking your essay. The result comes in a few seconds.');
  return send(user.chatId, 'To check an essay, tap the button below.', MENU);
}

async function onButton(user: BotUser, data: string, deps: BotDeps): Promise<void> {
  if (data === 'check') return startCheck(user);
  if (data === 'go') return runCheck(user, deps);
  if (data === 'invite') return invite(user);
  if (data === 'word') return wordSettings(user);
  if (data === 'cancel') return cancel(user);
  if (data === 'menu') return send(user.chatId, 'What would you like to do?', MENU);
  if (data.startsWith('hour:')) return setWordHour(user, data.slice(5));
}

// ── Menu, help, invites ──────────────────────────────────────────────────────

async function welcome(user: BotUser, payload: string, isNew: boolean): Promise<void> {
  // An invite link opens the bot with "/start ref_<inviter id>". It counts
  // only for a student who is new to the bot, and never for yourself.
  let invited = false;
  const inviter = /^ref_(\d{1,20})$/.exec(payload)?.[1];
  if (isNew && inviter && inviter !== user.telegramId && (await userRef(inviter).get()).exists) {
    await userRef(user.telegramId).set({ referredBy: inviter }, { merge: true });
    invited = true;
  }
  const name = user.firstName ? `, ${esc(user.firstName)}` : '';
  await send(
    user.chatId,
    `Hi${name}! 👋\n\nSend me an IELTS Writing Task 2 essay and I'll estimate your band in about 20 seconds, with the mistakes worth fixing first.\n\n` +
      `You get <b>1 free check every week</b>. Invite friends to get more.` +
      (invited ? '\n\n🎁 A friend invited you. After your first check, you both get 1 extra free check.' : ''),
    MENU,
  );
}

async function help(user: BotUser): Promise<void> {
  await send(
    user.chatId,
    '<b>How it works</b>\n\n' +
      '1. Tap <i>Check my essay</i> or send /check.\n' +
      '2. Send the Task 2 question, then your essay.\n' +
      '3. You get your estimated band and the mistakes to fix first. The button under it opens the full report on the site.\n\n' +
      '/check: check an essay\n/invite: get free checks for inviting friends\n/word: your daily IELTS word\n/cancel: stop the current check',
    MENU,
  );
}

async function cancel(user: BotUser): Promise<void> {
  await userRef(user.telegramId).set({ step: 'idle', question: '', essay: '' }, { merge: true });
  await send(user.chatId, 'Cancelled.', MENU);
}

async function invite(user: BotUser): Promise<void> {
  const link = `https://t.me/${await botUsername()}?start=ref_${user.telegramId}`;
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Check your IELTS essay for free with WriteReady:')}`;
  await send(
    user.chatId,
    '🎁 <b>Invite friends, get free checks</b>\n\n' +
      `Send your link to friends. When a friend checks their first essay here, you both get 1 extra free check (up to ${MAX_INVITE_REWARDS_PER_MONTH} a month).\n\n` +
      `Your link:\n${esc(link)}\n\nExtra checks you have: <b>${user.bonusChecks ?? 0}</b>`,
    [[{ text: '📤 Share my link', url: share }], [{ text: '⬅️ Menu', data: 'menu' }]],
  );
}

// ── Free checks ──────────────────────────────────────────────────────────────

type Spent = 'weekly-account' | 'weekly-bot' | 'bonus';

interface Allowance { weekly: number; bonus: number }

/** What the student can still spend, without spending it. */
async function allowance(user: BotUser): Promise<Allowance> {
  const weekKey = currentWeekKey();
  let used = user.weekKey === weekKey ? (user.weekCount ?? 0) : 0;
  if (user.uid) {
    const account = await db().collection('users').doc(user.uid).get();
    if (account.exists) {
      const free = (account.data()?.freeUsage ?? {}) as { weekKey?: string; count?: number };
      used = free.weekKey === weekKey ? (free.count ?? 0) : 0;
    }
  }
  return { weekly: Math.max(0, FREE_CHECKS_PER_WEEK - used), bonus: user.bonusChecks ?? 0 };
}

/**
 * Takes one check: this week's free one first (on the connected account, so
 * the site and the bot share it), then an extra one from invites. Null when
 * there is none left.
 */
async function spendCheck(telegramId: string): Promise<Spent | null> {
  const store = db();
  const botRef = userRef(telegramId);
  return store.runTransaction(async (tx) => {
    const bot = (await tx.get(botRef)).data() as BotUser;
    const accountRef = bot.uid ? store.collection('users').doc(bot.uid) : null;
    const account = accountRef ? await tx.get(accountRef) : null;
    const weekKey = currentWeekKey();

    if (accountRef && account?.exists) {
      const free = (account.data()?.freeUsage ?? {}) as { weekKey?: string; count?: number };
      const used = free.weekKey === weekKey ? (free.count ?? 0) : 0;
      if (used < FREE_CHECKS_PER_WEEK) {
        tx.set(accountRef, { freeUsage: { weekKey, count: used + 1 } }, { merge: true });
        return 'weekly-account';
      }
    } else {
      const used = bot.weekKey === weekKey ? (bot.weekCount ?? 0) : 0;
      if (used < FREE_CHECKS_PER_WEEK) {
        tx.set(botRef, { weekKey, weekCount: used + 1 }, { merge: true });
        return 'weekly-bot';
      }
    }
    const bonus = bot.bonusChecks ?? 0;
    if (bonus > 0) {
      tx.set(botRef, { bonusChecks: bonus - 1 }, { merge: true });
      return 'bonus';
    }
    return null;
  });
}

/** Gives back a check the student was charged for when the marking failed. */
async function refundCheck(telegramId: string, spent: Spent): Promise<void> {
  const store = db();
  const botRef = userRef(telegramId);
  await store.runTransaction(async (tx) => {
    const bot = (await tx.get(botRef)).data() as BotUser;
    const weekKey = currentWeekKey();
    if (spent === 'bonus') {
      tx.set(botRef, { bonusChecks: (bot.bonusChecks ?? 0) + 1 }, { merge: true });
    } else if (spent === 'weekly-bot') {
      if (bot.weekKey === weekKey) tx.set(botRef, { weekCount: Math.max(0, (bot.weekCount ?? 1) - 1) }, { merge: true });
    } else if (bot.uid) {
      const accountRef = store.collection('users').doc(bot.uid);
      const free = ((await tx.get(accountRef)).data()?.freeUsage ?? {}) as { weekKey?: string; count?: number };
      if (free.weekKey === weekKey) tx.set(accountRef, { freeUsage: { weekKey, count: Math.max(0, (free.count ?? 1) - 1) } }, { merge: true });
    }
  });
}

function allowanceLine(a: Allowance): string {
  return `Free checks left: <b>${a.weekly}</b> this week, <b>${a.bonus}</b> extra.`;
}

async function noChecksLeft(user: BotUser): Promise<void> {
  await send(
    user.chatId,
    "You've used this week's free check. It comes back next week.\n\n" +
      '🎁 Invite a friend: when they check their first essay, you both get 1 extra check.\n' +
      '📖 On the site, a paid plan gives you full reports with every sentence corrected.',
    [[{ text: '🎁 Invite friends', data: 'invite' }], [{ text: '💳 See plans', url: `${SITE}/pricing` }]],
  );
}

// ── Checking an essay ────────────────────────────────────────────────────────

async function startCheck(user: BotUser): Promise<void> {
  const left = await allowance(user);
  if (left.weekly + left.bonus === 0) return noChecksLeft(user);
  await userRef(user.telegramId).set({ step: 'question', question: '', essay: '' }, { merge: true });
  await send(
    user.chatId,
    'Send the <b>Task 2 question</b>, the whole task as it appears in the exam.\n\n' +
      '<i>Task 1 needs its chart, so the bot checks Task 2 for now.</i>',
    CANCEL,
  );
}

async function takeQuestion(user: BotUser, text: string): Promise<void> {
  if (text.length < 20) {
    return send(user.chatId, 'That looks too short for a Task 2 question. Please send the whole question.', CANCEL);
  }
  if (text.length > LIMITS.questionChars) {
    return send(user.chatId, 'That question is too long. Please send just the Task 2 question.', CANCEL);
  }
  await userRef(user.telegramId).set({ step: 'essay', question: text, essay: '' }, { merge: true });
  await send(
    user.chatId,
    'Now send your <b>essay</b>.\n\nIf Telegram splits a long essay into parts, send them all, then tap <i>Check my essay</i>.',
    CANCEL,
  );
}

async function takeEssay(user: BotUser, text: string): Promise<void> {
  // Telegram splits a long paste into several messages; they join back in order.
  const essay = user.essay ? `${user.essay}\n${text}` : text;
  const words = countWords(essay);
  if (essay.length > LIMITS.essayChars || words > LIMITS.essayWords) {
    return send(user.chatId, `That's ${words} words, more than the checker takes (${LIMITS.essayWords}). Please send one essay. /cancel to start again.`);
  }
  await userRef(user.telegramId).set({ step: 'essay', essay }, { merge: true });
  await send(
    user.chatId,
    `Got it: <b>${words} words</b>. Send more if your essay continues, or tap the button to check it.`,
    [[{ text: '✅ Check my essay', data: 'go' }], [{ text: 'Cancel', data: 'cancel' }]],
  );
}

async function runCheck(user: BotUser, deps: BotDeps): Promise<void> {
  const ref = userRef(user.telegramId);
  // Only one check at a time: a second tap on the button, or Telegram
  // delivering it twice, finds the check already running and stops here.
  const started = await db().runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as BotUser;
    const stuck = current.step === 'checking' && Date.now() - (current.checkingAt ?? 0) > STUCK_CHECK_MS;
    if ((current.step !== 'essay' && !stuck) || !current.essay || !current.question) return null;
    tx.set(ref, { step: 'checking', checkingAt: Date.now() }, { merge: true });
    return current;
  });
  if (!started) {
    if (user.step === 'checking') return send(user.chatId, 'Still checking your essay. The result comes in a few seconds.');
    return send(user.chatId, 'To check an essay, tap the button below.', MENU);
  }

  const question = started.question!;
  const essay = started.essay!;
  const wordCount = countWords(essay);
  const backToEssay = () => ref.set({ step: 'essay' }, { merge: true });

  if (wordCount < MIN_WORDS) {
    await backToEssay();
    return send(user.chatId, `Your essay is ${wordCount} words. Send at least ${MIN_WORDS} words to get a band (the exam asks for 250).`);
  }

  const spent = await spendCheck(user.telegramId);
  if (!spent) {
    await backToEssay();
    return noChecksLeft(started);
  }

  await send(user.chatId, '⏳ Checking your essay. This takes about 20 seconds.');
  await tg('sendChatAction', { chat_id: user.chatId, action: 'typing' }).catch(() => {});

  const keys = essayKeys('Task 2', question, essay);
  const lock = await loadScoreLock(keys.contentKey).catch((e) => {
    console.error('bot: could not read the score lock; marking afresh:', e);
    return null;
  });

  let marked: Marked;
  try {
    marked = await deps.mark({ question, essay, wordCount, lock });
  } catch (e) {
    console.error('bot: marking failed:', e);
    await refundCheck(user.telegramId, spent).catch((err) => console.error('bot: refund failed:', err));
    await backToEssay();
    return send(user.chatId, 'Sorry, the check failed and you were not charged. Tap the button to try again.', [
      [{ text: '🔁 Try again', data: 'go' }],
      [{ text: 'Cancel', data: 'cancel' }],
    ]);
  }
  // A text marked before keeps its bands, here as on the site.
  const scores = lock ? lock.scores : marked.scores;
  const result: Marked = { ...marked, scores };

  if (!lock) {
    await saveScoreLock(keys.contentKey, 'Task 2', { scores, topic: marked.topic })
      .catch((e) => console.error('bot: could not save the score lock:', e));
  }
  if (started.uid) {
    await deps.saveToAccount(started.uid, keys, essay, result).catch((e) => console.error('bot: could not save to the account:', e));
  }

  // The button opens the essay on the site. The link is private to this
  // student and carries no essay text itself: the site fetches it after sign-in.
  const code = randomBytes(9).toString('base64url');
  await db().collection(BOT_LINKS).doc(code).set({
    telegramId: user.telegramId,
    taskType: 'Task 2',
    question,
    essay,
    createdAt: Date.now(),
    expiresAt: Date.now() + LINK_DAYS * 24 * 3600 * 1000,
  });
  await ref.set({ step: 'idle', question: '', essay: '', checks: (started.checks ?? 0) + 1 }, { merge: true });

  const after = await allowance((await ref.get()).data() as BotUser);
  const mistakes = result.mistakes.length
    ? `\n\n<b>Fix these first</b>\n${result.mistakes.map((m, i) => `${i + 1}. ${esc(m)}`).join('\n')}`
    : '';
  await send(
    user.chatId,
    `📊 <b>Estimated band: ${scores.overall.toFixed(1)}</b>\n\n` +
      `Task Response: ${scores.taskAchievement.toFixed(1)}\n` +
      `Coherence and Cohesion: ${scores.coherenceCohesion.toFixed(1)}\n` +
      `Vocabulary: ${scores.lexicalResource.toFixed(1)}\n` +
      `Grammar: ${scores.grammaticalRangeAccuracy.toFixed(1)}` +
      mistakes +
      '\n\n<i>A quick estimate from the same marking as writeready.uz. The full report goes through every sentence and includes a band 8 sample answer.</i>\n\n' +
      allowanceLine(after),
    [
      [{ text: '📖 See full feedback and a band 8 sample', url: `${SITE}/tg/${code}` }],
      [{ text: '✍️ Check another essay', data: 'check' }],
    ],
  );

  await rewardInvite(user.telegramId).catch((e) => console.error('bot: invite reward failed:', e));
}

/**
 * The first check of a student who came through an invite: both get one
 * extra check. The inviter's side stops at MAX_INVITE_REWARDS_PER_MONTH.
 */
async function rewardInvite(telegramId: string): Promise<void> {
  const store = db();
  const friendRef = userRef(telegramId);
  const outcome = await store.runTransaction(async (tx) => {
    const friend = (await tx.get(friendRef)).data() as BotUser;
    if (!friend.referredBy || friend.referralRewarded) return null;
    const inviterRef = userRef(friend.referredBy);
    const inviterSnap = await tx.get(inviterRef);
    tx.set(friendRef, { referralRewarded: true, bonusChecks: (friend.bonusChecks ?? 0) + 1 }, { merge: true });
    if (!inviterSnap.exists) return { friendChat: friend.chatId, inviterChat: null };
    const inviter = inviterSnap.data() as BotUser;
    const monthKey = currentMonthKey();
    const count = inviter.referralMonth?.monthKey === monthKey ? inviter.referralMonth.count : 0;
    if (count >= MAX_INVITE_REWARDS_PER_MONTH) return { friendChat: friend.chatId, inviterChat: null };
    tx.set(inviterRef, { bonusChecks: (inviter.bonusChecks ?? 0) + 1, referralMonth: { monthKey, count: count + 1 } }, { merge: true });
    return { friendChat: friend.chatId, inviterChat: inviter.chatId };
  });
  if (!outcome) return;
  await send(outcome.friendChat, '🎁 You joined through a friend\'s invite, so you got <b>1 extra free check</b>.').catch(() => {});
  if (outcome.inviterChat !== null) {
    await send(outcome.inviterChat, '🎁 A friend you invited just checked their first essay. You got <b>1 extra free check</b>!').catch(() => {});
  }
}

// ── Connecting the site account ──────────────────────────────────────────────

export interface LinkedEssay { taskType: 'Task 2'; question: string; essay: string }

/**
 * Opens a "See full feedback" link for a signed-in student: returns the essay
 * for the site to show, and connects the Telegram account to the site account
 * if it is not connected yet. A free check already spent in the bot this week
 * is carried over, so connecting never hands out a second one. Null when the
 * link is unknown or expired.
 */
export async function openLink(code: string, uid: string): Promise<LinkedEssay | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  const store = db();
  const link = (await store.collection(BOT_LINKS).doc(code).get()).data() as
    | { telegramId: string; question: string; essay: string; expiresAt: number }
    | undefined;
  if (!link || link.expiresAt < Date.now()) return null;

  const botRef = userRef(link.telegramId);
  const accountRef = store.collection('users').doc(uid);
  const connected = await store.runTransaction(async (tx) => {
    const botSnap = await tx.get(botRef);
    const accountSnap = await tx.get(accountRef);
    // An account the site has not finished creating is left for next time,
    // so this never writes a half profile.
    if (!botSnap.exists || !accountSnap.exists) return null;
    const bot = botSnap.data() as BotUser;
    if (bot.uid) return null;
    tx.set(botRef, { uid }, { merge: true });
    const weekKey = currentWeekKey();
    if (bot.weekKey === weekKey && (bot.weekCount ?? 0) > 0) {
      const free = (accountSnap.data()?.freeUsage ?? {}) as { weekKey?: string; count?: number };
      const used = free.weekKey === weekKey ? (free.count ?? 0) : 0;
      tx.set(accountRef, { freeUsage: { weekKey, count: Math.max(used, bot.weekCount ?? 0) } }, { merge: true });
    }
    return bot.chatId;
  });
  if (connected !== null) {
    await send(connected, '✅ Your Telegram is now connected to your WriteReady account. From now on, your weekly free check is shared between the bot and the site.').catch(() => {});
  }
  return { taskType: 'Task 2', question: link.question, essay: link.essay };
}

// ── Connecting the bot to Telegram ───────────────────────────────────────────

/** Telegram does not follow redirects, so this is the address the site answers on directly. */
export const WEBHOOK_URL = `${SITE}/api/telegram`;

export const COMMANDS = [
  { command: 'check', description: 'Check a Task 2 essay' },
  { command: 'invite', description: 'Get free checks for inviting friends' },
  { command: 'word', description: 'Your daily IELTS word' },
  { command: 'help', description: 'How the bot works' },
  { command: 'cancel', description: 'Stop the current check' },
];

/**
 * Points Telegram at the webhook, with its secret, and sets the command menu.
 * Run by opening the webhook address in a browser (api/telegram.ts), so the
 * token never has to leave Vercel. Anyone may run it: it can only ever set
 * these same values, and does nothing when they are already set.
 */
export async function ensureWebhook(token: string): Promise<{ changed: boolean }> {
  const info = await tg<{ url?: string }>('getWebhookInfo', {});
  if (info.url === WEBHOOK_URL) return { changed: false };
  await tg('setWebhook', {
    url: WEBHOOK_URL,
    secret_token: webhookSecret(token),
    allowed_updates: ['message', 'callback_query'],
  });
  await tg('setMyCommands', { commands: COMMANDS });
  await tg('setMyShortDescription', { short_description: 'Check your IELTS Writing Task 2 essay: your estimated band in about 20 seconds.' });
  await tg('setMyDescription', {
    description:
      'Send an IELTS Writing Task 2 essay and get your estimated band, a band for each criterion and the mistakes to fix first, ' +
      'in about 20 seconds. 1 free check every week, more for inviting friends. Full reports on writeready.uz.',
  });
  return { changed: true };
}

// ── Daily word ───────────────────────────────────────────────────────────────

async function wordSettings(user: BotUser): Promise<void> {
  const hours: Button[] = WORD_HOURS.map((h) => ({
    text: `${user.wordHour === h ? '✅ ' : ''}${String(h).padStart(2, '0')}:00`,
    data: `hour:${h}`,
  }));
  const rows: Button[][] = [];
  for (let i = 0; i < hours.length; i += 4) rows.push(hours.slice(i, i + 4));
  if (typeof user.wordHour === 'number') rows.push([{ text: 'Turn off', data: 'hour:off' }]);
  await send(
    user.chatId,
    '📚 <b>Daily word</b>\n\nPick the hour (Tashkent time) when you want a new IELTS word each day, with its Uzbek meaning and an example. It arrives within that hour.' +
      (typeof user.wordHour === 'number' ? `\n\nNow: every day at ${String(user.wordHour).padStart(2, '0')}:00.` : ''),
    rows,
  );
}

async function setWordHour(user: BotUser, value: string): Promise<void> {
  if (value === 'off') {
    await userRef(user.telegramId).set({ wordHour: null }, { merge: true });
    return send(user.chatId, 'Daily word turned off. Turn it back on any time with /word.');
  }
  const hour = Number(value);
  if (!WORD_HOURS.includes(hour)) return;
  await userRef(user.telegramId).set({ wordHour: hour }, { merge: true });
  const at = String(hour).padStart(2, '0');
  await send(user.chatId, `✅ Done. Your daily word arrives every day between ${at}:00 and ${at}:59. Here is today's:`);
  await sendWord(user, tashkentDay());
}

/** Sends the student their next word and moves them along the list. */
async function sendWord(user: BotUser, today: string): Promise<void> {
  const index = (user.wordIndex ?? 0) % DAILY_WORDS.length;
  const w = DAILY_WORDS[index];
  await send(
    user.chatId,
    `📚 <b>Word of the day</b>\n\n<b>${esc(w.word)}</b>: ${esc(w.uzbek)}\n<i>${esc(w.example)}</i>`,
  );
  await userRef(user.telegramId).set({ wordIndex: index + 1, lastWordDay: today }, { merge: true });
}

/**
 * Called by the hourly cron job (api/bot-daily.ts): the word for everyone who
 * picked this hour and has not had today's. A student who blocked the bot is
 * switched off, so they are not tried again every day.
 */
export async function sendDailyWords(hour: number, now = new Date()): Promise<{ sent: number; stopped: number }> {
  const today = tashkentDay(now);
  const snap = await db().collection(BOT_USERS).where('wordHour', '==', hour).get();
  let sent = 0;
  let stopped = 0;
  for (const doc of snap.docs) {
    const user = doc.data() as BotUser;
    if (user.lastWordDay === today) continue;
    try {
      await sendWord(user, today);
      sent++;
    } catch (e) {
      if (e instanceof TelegramError && e.unreachable) {
        await userRef(user.telegramId).set({ wordHour: null }, { merge: true });
        stopped++;
      } else {
        console.error('bot: daily word failed for one student:', e);
      }
    }
    // Telegram allows about 30 messages a second; stay well under it.
    await new Promise((r) => setTimeout(r, 50));
  }
  return { sent, stopped };
}
