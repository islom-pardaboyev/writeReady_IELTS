/**
 * Offline checks for the student Telegram bot (api/_lib/studentBot.ts).
 *
 *   npx tsx scripts/test-student-bot.ts
 *
 * No network, no database, no AI. Firestore is an in-memory stand-in (local
 * development shares the live database with the real site), Telegram is a
 * stand-in that records every message instead of sending it, and the AI
 * marking is a stand-in that returns fixed bands.
 */
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

process.env.NONCE_SECRET = 'test-secret-for-offline-checks-only';

const { setTestFirestore } = await import('../api/_lib/db.js');
const { setTestTelegram, TelegramError, webhookSecret } = await import('../api/_lib/telegramApi.js');
const bot = await import('../api/_lib/studentBot.js');
const { essayKeys, saveScoreLock } = await import('../api/_lib/savedReports.js');
const { normalizeScores } = await import('../api/_lib/bandScore.js');
const { currentWeekKey, currentMonthKey } = await import('../api/_lib/shared.js');
const { tashkentHour } = await import('../api/_lib/routes/botDaily.js');

// ── Firestore stand-in ──────────────────────────────────────────────────────

type Data = Record<string, unknown>;
const collections = new Map<string, Map<string, Data>>();
const table = (name: string) => {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
};
let autoId = 0;
// FieldValue.increment carries its number as `operand`; every other FieldValue
// here is serverTimestamp().
const resolve = (data: Data, before: Data): Data =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => {
    if (!(v instanceof FieldValue)) return [k, v];
    const operand = (v as unknown as { operand?: unknown }).operand;
    return [k, typeof operand === 'number' ? (Number(before[k]) || 0) + operand : Timestamp.now()];
  }));

function docRef(name: string, id: string) {
  const snapshot = () => {
    const data = table(name).get(id);
    return { id, exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined), get: (f: string) => data?.[f] };
  };
  const ref = {
    id,
    path: `${name}/${id}`,
    get: async () => snapshot(),
    set: async (data: Data, options?: { merge?: boolean }) => {
      const before = options?.merge ? table(name).get(id) ?? {} : {};
      table(name).set(id, { ...before, ...resolve(data, before) });
    },
    delete: async () => { table(name).delete(id); },
    snapshot,
  };
  return ref;
}
type Ref = ReturnType<typeof docRef>;

// Like Firestore, a range filter only matches values of the same type, so
// missing fields and nulls never match `>= 0`.
const comparable = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v);
const matches = (actual: unknown, op: string, wanted: unknown): boolean => {
  const a = comparable(actual);
  const w = comparable(wanted);
  if (op === '==') return a === w;
  if (a === undefined || a === null || typeof a !== typeof w) return false;
  const [x, y] = [a as number | string, w as number | string];
  if (op === '>=') return x >= y;
  if (op === '>') return x > y;
  if (op === '<=') return x <= y;
  if (op === '<') return x < y;
  throw new Error(`stand-in does not support ${op}`);
};

// orderBy a field, or by document id (FieldPath.documentId()), and startAfter a value of it.
interface Order { field: string | null; desc: boolean }
function query(name: string, filters: [string, string, unknown][], max = Infinity, order?: Order, after?: unknown) {
  const keyOf = (id: string, d: Data) => (order?.field ? comparable(d[order.field]) : id) as string | number;
  const found = () => {
    let rows = [...table(name).entries()].filter(([, d]) => filters.every(([f, op, v]) => matches(d[f], op, v)));
    if (order) {
      rows.sort(([ia, a], [ib, b]) => {
        const [x, y] = [keyOf(ia, a), keyOf(ib, b)];
        return (x < y ? -1 : x > y ? 1 : 0) * (order.desc ? -1 : 1);
      });
      if (after !== undefined) rows = rows.filter(([id, d]) => (order.desc ? keyOf(id, d) < (after as string) : keyOf(id, d) > (after as string)));
    }
    return rows.slice(0, max);
  };
  return {
    where: (field: string, op: string, value: unknown) => query(name, [...filters, [field, op, value]], max, order, after),
    limit: (n: number) => query(name, filters, n, order, after),
    orderBy: (field: unknown, dir?: string) => query(name, filters, max, { field: typeof field === 'string' ? field : null, desc: dir === 'desc' }, after),
    startAfter: (value: unknown) => query(name, filters, max, order, value),
    get: async () => {
      const docs = found().map(([id]) => ({ ...docRef(name, id).snapshot(), ref: docRef(name, id) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
    count: () => ({ get: async () => ({ data: () => ({ count: found().length }) }) }),
  };
}

// Firestore runs a transaction's reads before its writes and retries on
// conflict; one at a time, in order, gives the same outcome for these checks.
let queue: Promise<unknown> = Promise.resolve();
function runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
  const run = async () => {
    const writes: (() => Promise<void>)[] = [];
    const tx = {
      get: async (ref: Ref) => ref.snapshot(),
      set: (ref: Ref, data: Data, options?: { merge?: boolean }) => { writes.push(() => ref.set(data, options)); },
      delete: (ref: Ref) => { writes.push(() => ref.delete()); },
    };
    const result = await fn(tx);
    for (const w of writes) await w();
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

setTestFirestore({
  collection: (name: string) => ({
    ...query(name, []),
    doc: (id?: string) => docRef(name, id ?? `auto${String(++autoId).padStart(16, '0')}`),
  }),
  runTransaction,
} as unknown as Firestore);

// ── Telegram stand-in ───────────────────────────────────────────────────────

interface Sent { method: string; body: Record<string, unknown> }
let sent: Sent[] = [];
const blocked = new Set<number>();
const baseTelegram = async (method: string, body: Record<string, unknown>) => {
  if (method === 'sendMessage' && blocked.has(body.chat_id as number)) throw new TelegramError(method, 403, 'Forbidden: bot was blocked by the user');
  sent.push({ method, body });
  if (method === 'getMe') return { username: 'WriteReadyTestBot' };
  return true;
};
setTestTelegram(baseTelegram);
const messages = (chatId?: number) =>
  sent.filter((s) => s.method === 'sendMessage' && (chatId === undefined || s.body.chat_id === chatId)).map((s) => s.body);
const lastText = (chatId: number) => String(messages(chatId).at(-1)?.text ?? '');
const buttonsOf = (msg: Record<string, unknown> | undefined) =>
  ((msg?.reply_markup as { inline_keyboard?: { text: string; url?: string; callback_data?: string }[][] } | undefined)?.inline_keyboard ?? []).flat();

// ── AI marking stand-in ─────────────────────────────────────────────────────

const scores = (b: number) => normalizeScores({ taskAchievement: b, coherenceCohesion: b, lexicalResource: b, grammaticalRangeAccuracy: b })!;
let markCalls = 0;
let markFails = false;
let markDelayMs = 0;
const saved: { uid: string; band: number }[] = [];
/** Checks handed to the site when a full-feedback link opens (openLink's saveToAccount). */
const linkSaves: { uid: string; key: string; band: number; essay: string }[] = [];
let linkSaveFails = false;
const saveFromLink = async (uid: string, keys: { contentKey: string }, essay: string, marked: { scores: { overall: number } }) => {
  if (linkSaveFails) throw new Error('the database is down');
  linkSaves.push({ uid, key: keys.contentKey, band: marked.scores.overall, essay });
};
const deps = {
  async mark() {
    markCalls++;
    if (markDelayMs) await new Promise((r) => setTimeout(r, markDelayMs));
    if (markFails) throw new Error('the AI is down');
    return { scores: scores(6), topic: 'Education', mistakes: ['Use "these" before plural nouns, not <this>.', 'Split the long second sentence.'], raw: '{"scores":{}}' };
  },
  async saveToAccount(uid: string, _keys: unknown, _essay: string, marked: { scores: { overall: number } }) {
    saved.push({ uid, band: marked.scores.overall });
  },
};

// ── Helpers that play a student ─────────────────────────────────────────────

let updateId = 1000;
const say = (userId: number, text: string, extra: Record<string, unknown> = {}) =>
  bot.handleUpdate({ update_id: ++updateId, message: { chat: { id: userId, type: 'private' }, from: { id: userId, first_name: `Student${userId}` }, text, ...extra } }, deps);
const tap = (userId: number, data: string) =>
  bot.handleUpdate({ update_id: ++updateId, callback_query: { id: `cb${updateId}`, from: { id: userId, first_name: `Student${userId}` }, data, message: { chat: { id: userId } } } }, deps);
const botUser = (userId: number) => table(bot.BOT_USERS).get(String(userId)) as bot.BotUser | undefined;

const QUESTION = 'Some people believe that university education should be free for everyone. To what extent do you agree or disagree?';
const ESSAY = Array.from({ length: 8 }, (_, i) =>
  `Point ${i} is that free university education widens access for talented students from poor families and repays its cost later.`).join(' ');

async function submitEssay(userId: number, essay = ESSAY) {
  await tap(userId, 'check');
  await say(userId, QUESTION);
  await say(userId, essay);
}

const DAY = 24 * 3600 * 1000;
/** openLink's essay, when it opened one. */
const essayOf = (o: Awaited<ReturnType<typeof bot.openLink>>) => (o && typeof o === 'object' && o.kind === 'essay' ? o : null);
const linkIn = (msg: Record<string, unknown> | undefined) => (buttonsOf(msg).find((b) => b.url?.includes('/tg/'))?.url ?? '').split('/tg/')[1] ?? '';
process.env.TELEGRAM_ADMIN_IDS = '900, not-an-id';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}

// ── Checks ──────────────────────────────────────────────────────────────────

console.log('\nStarting');
await say(101, '/start');
check('a new student is recorded', botUser(101)?.step === 'idle' && botUser(101)?.chatId === 101);
check('the welcome shows the menu', buttonsOf(messages(101).at(-1)).some((b) => b.callback_data === 'check'));
const before = messages(101).length;
await bot.handleUpdate({ update_id: updateId, message: { chat: { id: 101, type: 'private' }, from: { id: 101 }, text: '/start' } }, deps);
check('an update Telegram sends twice is handled once', messages(101).length === before);
await bot.handleUpdate({ update_id: ++updateId, message: { chat: { id: -5, type: 'group' }, from: { id: 102 }, text: '/start' } }, deps);
check('group chats are ignored', !botUser(102) && messages(-5).length === 0);
await say(101, '', { text: undefined });
check('a message without text gets a hint', lastText(101).includes('as text messages'));
await say(101, '/nonsense');
check('an unknown command shows the help', lastText(101).includes('How it works'));
check('the help says how to reach the team', lastText(101).includes('@writeready_admin') && lastText(101).includes('/contact'));
await say(101, '/contact');
check("/contact gives the team's Telegram", lastText(101).includes('@writeready_admin') && buttonsOf(messages(101).at(-1)).some((b) => b.url === 'https://t.me/writeready_admin'));
check('and the menu has a Contact us button', buttonsOf(messages(101)[0]).some((b) => b.text.includes('Contact us') && b.url === bot.CONTACT_URL));

console.log('\nChecking an essay');
await tap(101, 'check');
check('check asks for the Task 2 question', botUser(101)?.step === 'question' && lastText(101).includes('Task 2 question'));
await say(101, 'too short');
check('a very short question is refused', botUser(101)?.step === 'question' && lastText(101).includes('too short'));
await say(101, QUESTION);
check('the question is kept and the essay asked for', botUser(101)?.question === QUESTION && botUser(101)?.step === 'essay');
const half = ESSAY.slice(0, 300);
await say(101, half);
check('the essay is counted and the check button shown', lastText(101).includes('words') && buttonsOf(messages(101).at(-1)).some((b) => b.callback_data === 'go'));
await say(101, ESSAY.slice(300));
check('a second part joins the first', botUser(101)?.essay === `${half}\n${ESSAY.slice(300)}`);

await tap(101, 'cancel');
await submitEssay(101, 'Only a few words here.');
await tap(101, 'go');
check('an essay under the minimum is refused without charging', markCalls === 0 && botUser(101)?.freeCheckAt == null && botUser(101)?.step === 'essay');

await tap(101, 'cancel');
await submitEssay(101);
await tap(101, 'go');
const result = messages(101).at(-1);
const u101 = botUser(101)!;
check('the AI marks the essay once', markCalls === 1);
check('the free check is spent', typeof u101.freeCheckAt === 'number' && Date.now() - u101.freeCheckAt < 5000);
check('and the message that it is back is set for 2 weeks later', u101.remindAt === u101.freeCheckAt! + 14 * DAY);
check('the result says when the next free check is', String(result?.text).includes('Next free check: <b>'));
check('the result shows the band', String(result?.text).includes('Estimated band: 6.0') && String(result?.text).includes('Vocabulary: 6.0'));
check("the mistakes are listed, with the student's text made safe", String(result?.text).includes('1. Use "these"') && String(result?.text).includes('&lt;this&gt;'));
const fullButton = buttonsOf(result).find((b) => b.url?.includes('/tg/'));
const code = fullButton?.url?.split('/tg/')[1] ?? '';
check('the full-feedback button opens the essay on the site', Boolean(fullButton) && table(bot.BOT_LINKS).get(code)?.essay === ESSAY);
check('the check ends and the essay is cleared', u101.step === 'idle' && u101.essay === '' && u101.checks === 1);
const lockKey = essayKeys('Task 2', QUESTION, ESSAY).contentKey;
check('the bands are locked for this exact text, as on the site', table('score_locks').has(lockKey));
check('an unconnected student is not saved to any account', saved.length === 0);

await tap(101, 'check');
check('a second check says none are left, and when the next one is', lastText(101).includes("You've used your free check. The next one is ready on") && botUser(101)?.step === 'idle');
check('and offers to connect the site account for a weekly one', buttonsOf(messages(101).at(-1)).some((b) => b.callback_data === 'connect') && lastText(101).includes('every week'));

console.log('\nA free check every 2 weeks');
const spentAt = botUser(101)!.freeCheckAt!;
table(bot.BOT_USERS).set('101', { ...botUser(101)!, freeCheckAt: Date.now() - 13 * DAY });
await tap(101, 'check');
check('13 days later there is still none', lastText(101).includes("You've used your free check"));
table(bot.BOT_USERS).set('101', { ...botUser(101)!, freeCheckAt: Date.now() - 14 * DAY });
await tap(101, 'check');
check('14 days later it is back', botUser(101)?.step === 'question');
await tap(101, 'cancel');
table(bot.BOT_USERS).set('101', { ...botUser(101)!, freeCheckAt: spentAt });
const monday = bot.weekStartMs(currentWeekKey());
check('weeks start on Monday 00:00 UTC', new Date(monday).getUTCDay() === 1 && new Date(monday).getUTCHours() === 0 && monday <= Date.now() && Date.now() < monday + 7 * DAY);
check('week 1 is the week with 4 January in it', new Date(bot.weekStartMs('2026-W01')).toISOString() === '2025-12-29T00:00:00.000Z' && bot.weekStartMs('nonsense') === 0);
table(bot.BOT_USERS).set('150', { telegramId: '150', chatId: 150, createdAt: Date.now(), lastUpdateId: 0, step: 'idle', weekKey: currentWeekKey(), weekCount: 1 });
await tap(150, 'check');
check('a check spent before this change still counts', lastText(150).includes("You've used your free check"));
table(bot.BOT_USERS).set('150', { telegramId: '150', chatId: 150, createdAt: Date.now(), lastUpdateId: 0, step: 'idle', weekKey: '2026-W30', weekCount: 1 });
await tap(150, 'check');
check('and one from weeks ago does not', botUser(150)?.step === 'question');
check('a moment reads in Tashkent time', bot.tashkentTime(Date.UTC(2026, 9, 9, 9, 30)) === '9 Oct, 14:30');

console.log('\nOne check at a time, and failures');
await say(103, '/start');
await submitEssay(103);
markDelayMs = 20;
const calls = markCalls;
await Promise.all([tap(103, 'go'), tap(103, 'go')]);
markDelayMs = 0;
check('two taps on the button mark the essay once', markCalls === calls + 1 && typeof botUser(103)?.freeCheckAt === 'number');

await say(104, '/start');
await submitEssay(104);
markFails = true;
await tap(104, 'go');
markFails = false;
check('a failed marking gives the check back', botUser(104)?.freeCheckAt == null && botUser(104)?.remindAt == null && botUser(104)?.step === 'essay');
check('and says the student was not charged', lastText(104).includes('not charged'));
await tap(104, 'go');
check('trying again then works', lastText(104).includes('Estimated band') && typeof botUser(104)?.freeCheckAt === 'number');

console.log('\nLocked bands');
const lockedEssay = `${ESSAY} This version was marked before.`;
await saveScoreLock(essayKeys('Task 2', QUESTION, lockedEssay).contentKey, 'Task 2', { scores: scores(7.5), topic: 'Education' });
await say(105, '/start');
await submitEssay(105, lockedEssay);
await tap(105, 'go');
check('a text marked before shows its locked band', lastText(105).includes('Estimated band: 7.5'));

console.log('\nInvites');
await tap(101, 'invite');
check('the invite shows a personal link', lastText(101).includes('t.me/WriteReadyTestBot?start=ref_101'));
await say(201, '/start ref_101');
check('a new student who came through a link is linked to the inviter', botUser(201)?.referredBy === '101' && lastText(201).includes('A friend invited you'));
await say(202, '/start ref_202');
check('you cannot invite yourself', botUser(202)?.referredBy === undefined);
await say(203, '/start ref_999999');
check('an unknown inviter is ignored', botUser(203)?.referredBy === undefined);
await say(101, '/start ref_201');
check('someone already using the bot is not re-linked', botUser(101)?.referredBy === undefined);

await submitEssay(201);
await tap(201, 'go');
check("the friend's first check gives both an extra check", botUser(201)?.bonusChecks === 1 && botUser(101)?.bonusChecks === 1);
check('the inviter is told', lastText(101).includes('A friend you invited'));
check('the reward is counted for the month', botUser(101)?.referralMonth?.monthKey === currentMonthKey() && botUser(101)?.referralMonth?.count === 1);
await submitEssay(201);
await tap(201, 'go');
check('an extra check is used once the weekly one is gone', botUser(201)?.bonusChecks === 0 && lastText(201).includes('Estimated band'));
check('a second check never rewards the invite again', botUser(101)?.bonusChecks === 1);

table(bot.BOT_USERS).set('101', { ...botUser(101)!, referralMonth: { monthKey: currentMonthKey(), count: bot.MAX_INVITE_REWARDS_PER_MONTH } });
await say(204, '/start ref_101');
await submitEssay(204);
await tap(204, 'go');
check('past the monthly limit the friend still gets theirs, the inviter not', botUser(204)?.bonusChecks === 1 && botUser(101)?.bonusChecks === 1);

console.log('\nThe full-feedback link');
// The newest message with a full-feedback button, for a student.
const codeOf = (userId: number) => {
  const withLink = messages(userId).filter((m) => buttonsOf(m).some((b) => b.url?.includes('/tg/'))).at(-1);
  return (buttonsOf(withLink).find((b) => b.url?.includes('/tg/'))?.url ?? '').split('/tg/')[1] ?? '';
};
const first204 = codeOf(204);
check('an unknown code opens nothing', (await bot.openLink('unknowncode123', 'uidA')) === null);
check('a malformed code opens nothing', (await bot.openLink('../../users', 'uidA')) === null);
table('users').set('uidA', { email: 'a@example.com', plan: 'free' });
check('the link keeps the check the student was shown', (table(bot.BOT_LINKS).get(code)?.result as { scores?: { overall?: number } } | undefined)?.scores?.overall === 6);
sent = [];
const opened = essayOf(await bot.openLink(code, 'uidA', saveFromLink));
check('a valid code returns the essay', opened?.essay === ESSAY && opened?.question === QUESTION);
check("the check is saved to the account that opened it, under the site's own key for the essay", linkSaves.length === 1 && linkSaves[0].uid === 'uidA' && linkSaves[0].key === lockKey && linkSaves[0].band === 6 && linkSaves[0].essay === ESSAY);
check('the link is deleted once opened', !table(bot.BOT_LINKS).has(code) && botUser(101)?.linkCode === '');
check('it connects the Telegram account', botUser(101)?.uid === 'uidA');
check("this week's bot check carries over to the account", (table('users').get('uidA')?.freeUsage as { count?: number })?.count === 1);
check('and the message that it is back moves to Monday, with the site week', botUser(101)?.remindAt === monday + 7 * DAY);
check('the student is told in Telegram', lastText(101).includes('now connected'));
sent = [];
check('a second tap finds nothing, so it cannot start a second report', (await bot.openLink(code, 'uidA', saveFromLink)) === null && messages(101).length === 0 && linkSaves.length === 1);
check('and cannot connect someone else', (await bot.openLink(code, 'uidB')) === null && botUser(101)?.uid === 'uidA');

await say(206, '/start');
await submitEssay(206);
await tap(206, 'go');
const code206 = codeOf(206);
table('users').set('uidD', { email: 'd@example.com', plan: 'standard' });
const both = await Promise.all([bot.openLink(code206, 'uidD'), bot.openLink(code206, 'uidD')]);
check('two tabs at the same moment: exactly one gets the essay', both.filter(Boolean).length === 1 && !table(bot.BOT_LINKS).has(code206));

table(bot.BOT_LINKS).set('expiredcode12', { telegramId: '104', question: QUESTION, essay: ESSAY, expiresAt: Date.now() - 1 });
check('an expired link opens nothing, and is removed', (await bot.openLink('expiredcode12', 'uidA')) === null && !table(bot.BOT_LINKS).has('expiredcode12'));

await submitEssay(204);
await tap(204, 'go');
const second204 = codeOf(204);
check('a new check deletes the unused link from the one before', Boolean(first204) && Boolean(second204) && first204 !== second204 && !table(bot.BOT_LINKS).has(first204) && table(bot.BOT_LINKS).has(second204));
check('so a student never has more than one link waiting', [...table(bot.BOT_LINKS).values()].filter((l) => l.telegramId === '204').length === 1 && botUser(204)?.linkCode === second204);

await say(205, '/start');
await submitEssay(205);
await tap(205, 'go');
const code205 = codeOf(205);
check('an account the site has not finished creating still gets the essay, but is not connected yet', essayOf(await bot.openLink(code205, 'uidNew', saveFromLink))?.essay === ESSAY && botUser(205)?.uid === undefined && !table(bot.BOT_LINKS).has(code205));
check('and nothing is saved to an account that does not exist yet', !linkSaves.some((l) => l.uid === 'uidNew'));
const savesBefore = linkSaves.length;
table(bot.BOT_LINKS).set('oldlinkcode1', { telegramId: '205', kind: 'essay', taskType: 'Task 2', question: QUESTION, essay: ESSAY, createdAt: Date.now(), expiresAt: Date.now() + DAY });
check('a link made before checks were kept in it still opens, with nothing to save', essayOf(await bot.openLink('oldlinkcode1', 'uidA', saveFromLink))?.essay === ESSAY && linkSaves.length === savesBefore);
table(bot.BOT_LINKS).set('expiredwith1', { telegramId: '205', kind: 'essay', taskType: 'Task 2', question: QUESTION, essay: ESSAY, result: { scores: scores(6), topic: 'x', mistakes: [], raw: '{}' }, createdAt: 0, expiresAt: Date.now() - 1 });
check('an expired link saves nothing', (await bot.openLink('expiredwith1', 'uidA', saveFromLink)) === null && linkSaves.length === savesBefore);
await say(207, '/start');
await submitEssay(207);
await tap(207, 'go');
linkSaveFails = true;
check('if saving fails, the essay still opens', essayOf(await bot.openLink(codeOf(207), 'uidA', saveFromLink))?.essay === ESSAY);
linkSaveFails = false;

console.log('\nA connected student');
table('users').set('uidC', { email: 'c@example.com', plan: 'free', freeUsage: { weekKey: currentWeekKey(), count: 1 } });
table(bot.BOT_USERS).set('301', { telegramId: '301', chatId: 301, createdAt: 0, lastUpdateId: 0, step: 'idle', uid: 'uidC' });
await tap(301, 'check');
check('a free report used on the site this week leaves none in the bot', lastText(301).includes("You've used this week's free check (it is shared with the site)"));
check('with no offer to connect again', !buttonsOf(messages(301).at(-1)).some((b) => b.callback_data === 'connect'));
table('users').set('uidC', { email: 'c@example.com', plan: 'free' });
await submitEssay(301);
await tap(301, 'go');
check("the check is counted on the account, shared with the site", (table('users').get('uidC')?.freeUsage as { count?: number })?.count === 1 && botUser(301)?.freeCheckAt === undefined);
check('its message is set for Monday, when the site week starts again', botUser(301)?.remindAt === monday + 7 * DAY);
check('and saved to their history on the site', saved.some((s) => s.uid === 'uidC' && s.band === 6));

console.log('\nMy account');
await say(601, '/start');
await say(601, '/account');
let acc = lastText(601);
check('/account shows the free check, the settings and the Telegram ID', acc.includes('not connected') && acc.includes('Free check: <b>ready</b>') && acc.includes('1 every 2 weeks') && acc.includes('Daily word: <b>off</b>') && acc.includes('Telegram ID: <code>601</code>'));
check('with a button to connect the site account', buttonsOf(messages(601).at(-1)).some((b) => b.callback_data === 'connect'));
await tap(601, 'account');
check('the menu button opens it too', lastText(601).includes('Your account'));
table('users').set('uidC', { ...table('users').get('uidC'), plan: 'standard', usage: { monthKey: currentMonthKey(), count: 5 }, bonusAnalyses: 2 });
await say(301, '/account');
acc = lastText(301);
check('a connected student sees their account and plan', acc.includes('✅ connected, c@example.com') && acc.includes('Plan: <b>Standard</b>, 7 of 12 full reports left this month') && acc.includes('Bonus reports on the site: <b>2</b>'));
check("a paid plan's free bot check is on top of the plan, not shared", acc.includes("Free bot check: <b>next on") && acc.includes('on top of your plan') && !acc.includes('shared with the site'));

console.log('\nA student with a paid plan');
await tap(301, 'check');
const paidNone = messages(301).at(-1);
check('out of free bot checks, they are sent to their plan on the site', lastText(301).includes("You've used this week's free bot check") && lastText(301).includes('Your Standard plan has <b>7</b> of 12 full reports left this month'));
check('not to the plans page', !buttonsOf(paidNone).some((b) => b.url?.includes('/pricing')) && !lastText(301).includes('a paid plan gives you') && buttonsOf(paidNone).some((b) => b.url === 'https://www.writeready.uz'));
table('users').set('uidC', { ...table('users').get('uidC'), freeUsage: {} });
await submitEssay(301);
await tap(301, 'go');
check("the bot check never spends the plan's reports", (table('users').get('uidC')?.usage as { count?: number })?.count === 5 && (table('users').get('uidC')?.freeUsage as { count?: number })?.count === 1);
check('the result says the full report uses 1 report from the plan', lastText(301).includes('Getting it uses 1 report from your plan.') && lastText(301).includes('Free bot check this week: <b>0</b>') && lastText(301).includes('<b>7</b> of 12 full reports left'));

console.log('\nConnecting from the bot');
await tap(601, 'connect');
const connect1 = linkIn(messages(601).at(-1));
const stored = table(bot.BOT_LINKS).get(connect1);
const lasts = Number(stored?.expiresAt) - Date.now();
check('connect sends a sign-in link that lasts an hour and holds no essay', stored?.kind === 'connect' && lasts <= 3600 * 1000 && lasts > 3500 * 1000 && stored?.essay === undefined);
await tap(601, 'connect');
const connect2 = linkIn(messages(601).at(-1));
check('asking again replaces the link, so only one waits', connect1 !== connect2 && !table(bot.BOT_LINKS).has(connect1) && table(bot.BOT_LINKS).has(connect2) && botUser(601)?.connectCode === connect2);
check('an account the site is still creating: try again, the link is kept', (await bot.openLink(connect2, 'uidE')) === 'not-ready' && table(bot.BOT_LINKS).has(connect2) && botUser(601)?.uid === undefined);
table(bot.BOT_USERS).set('601', { ...botUser(601)!, freeCheckAt: Math.max(monday, Date.now() - 60_000), remindAt: Date.now() + 14 * DAY });
table('users').set('uidE', { email: 'e@example.com', plan: 'free' });
sent = [];
check('once the account exists, the link connects it', JSON.stringify(await bot.openLink(connect2, 'uidE')) === '{"kind":"connect"}' && botUser(601)?.uid === 'uidE');
check('and is used up', !table(bot.BOT_LINKS).has(connect2) && botUser(601)?.connectCode === '' && (await bot.openLink(connect2, 'uidE')) === null);
check('the free check spent in the bot this week counts on the account', (table('users').get('uidE')?.freeUsage as { count?: number })?.count === 1 && botUser(601)?.remindAt === monday + 7 * DAY);
check('the student is told in Telegram', lastText(601).includes('now connected') && lastText(601).includes('every week'));
await tap(601, 'connect');
const switchCode = linkIn(messages(601).at(-1));
table('users').set('uidF', { email: 'f@example.com', plan: 'free' });
check('a connect link can move the Telegram to another account', JSON.stringify(await bot.openLink(switchCode, 'uidF')) === '{"kind":"connect"}' && botUser(601)?.uid === 'uidF');
check('without carrying anything over to it', table('users').get('uidF')?.freeUsage === undefined && botUser(601)?.remindAt === null);
check('a free account is told the weekly check is shared with the site', lastText(601).includes('shared between the bot and the site'));
await tap(601, 'connect');
const lifetimeCode = linkIn(messages(601).at(-1));
table('users').set('uidH', { email: 'h@example.com', plan: 'forever' });
await bot.openLink(lifetimeCode, 'uidH');
check('a paid account is told the weekly check comes on top of the plan', botUser(601)?.uid === 'uidH' && lastText(601).includes('on top of your plan'));
await say(601, '/account');
check('Lifetime shows no monthly limit', lastText(601).includes('Plan: <b>Lifetime</b>, no monthly limit'));
check('a full-feedback link never moves a connected Telegram', Boolean(botUser(301)?.linkCode) && essayOf(await bot.openLink(botUser(301)!.linkCode!, 'uidD'))?.essay === ESSAY && botUser(301)?.uid === 'uidC');
table(bot.BOT_LINKS).set('oldconnect12', { telegramId: '601', kind: 'connect', expiresAt: Date.now() - 1 });
check('an expired connect link opens nothing, and is removed', (await bot.openLink('oldconnect12', 'uidA')) === null && !table(bot.BOT_LINKS).has('oldconnect12') && botUser(601)?.uid === 'uidH');
await tap(601, 'connect');
const connect3 = linkIn(messages(601).at(-1));
const savesBeforeConnect = linkSaves.length;
check('a connect link has no check to save', JSON.stringify(await bot.openLink(connect3, 'uidH', saveFromLink)) === '{"kind":"connect"}' && linkSaves.length === savesBeforeConnect);

console.log('\nYour free check is back');
await say(701, '/start');
await submitEssay(701);
await tap(701, 'go');
const due = botUser(701)!.remindAt!;
sent = [];
await bot.sendReminders(due - 60_000);
check('nothing is sent before the free check is back', messages(701).length === 0 && botUser(701)?.remindAt === due);
await bot.sendReminders(due + 60_000);
check('then the student is told, once', lastText(701).includes('Your free check is back') && botUser(701)?.remindAt === null);
check('with a check button and a way to stop these messages', buttonsOf(messages(701).at(-1)).some((b) => b.callback_data === 'check') && buttonsOf(messages(701).at(-1)).some((b) => b.callback_data === 'remind:off'));
await bot.sendReminders(due + 2 * 60_000);
check('and not again', messages(701).length === 1);
await say(702, '/start');
await submitEssay(702);
await tap(702, 'go');
await tap(702, 'remind:off');
check('turned off, nothing is waiting to be sent', botUser(702)?.remindersOff === true && botUser(702)?.remindAt === null);
await submitEssay(702);
sent = [];
await bot.sendReminders(due + 60_000);
check('and nothing is sent', messages(702).length === 0);
await tap(702, 'remind:on');
check('turned back on, it waits for the next free check', botUser(702)?.remindersOff === false && botUser(702)?.remindAt === botUser(702)!.freeCheckAt! + 14 * DAY);
table(bot.BOT_USERS).set('301', { ...botUser(301)!, remindAt: Date.now() - 1000 });
sent = [];
await bot.sendReminders();
check('not sent when the free check was already used on the site', messages(301).length === 0 && botUser(301)?.remindAt === null);
await say(703, '/start');
await submitEssay(703);
await tap(703, 'go');
blocked.add(703);
const r703 = await bot.sendReminders(due + 60_000);
check('a student who blocked the bot is not tried again', r703.stopped >= 1 && botUser(703)?.remindAt === null);

console.log('\nAdmin');
await say(601, '/admin');
check('/admin is just an unknown command for students', lastText(601).includes('How it works'));
sent = [];
await tap(601, 'admin');
check('and its button does nothing for them', messages(601).length === 0);
table('humanReviews').set('r1', { status: 'pending' });
table('humanReviews').set('r2', { status: 'pending' });
table('humanReviews').set('r3', { status: 'checked' });
table('users').set('uidG', { email: 'g@example.com', createdAt: Timestamp.now() });
await say(900, '/start');
await say(900, '/admin');
const panel = lastText(900);
const stats = await bot.adminStats();
const botUsers = [...table(bot.BOT_USERS).values()];
check('the admin sees the panel', panel.includes('🛠 <b>Admin</b>') && panel.includes(`Students: <b>${stats.students}</b>`) && buttonsOf(messages(900).at(-1)).some((b) => b.callback_data === 'admin'));
check('students are counted, and new ones today', stats.students === botUsers.length && stats.newToday > 0 && stats.newToday < stats.students && stats.newWeek >= stats.newToday);
check('connected students are counted', stats.connected === botUsers.filter((u) => typeof u.uid === 'string' && u.uid !== '').length && stats.connected > 0);
check("today's checks and failures are counted", stats.checksToday === markCalls - 1 && stats.failedToday === 1 && stats.checksWeek === stats.checksToday && stats.checksAll === stats.checksToday);
check('with their rough AI cost', panel.includes(`about ${(stats.checksToday * 250).toLocaleString('en-US').replace(/,/g, ' ')} so'm today`));
check("the site's numbers too", stats.accounts === table('users').size && stats.accountsToday === 1 && stats.reportsToday === 0 && stats.reviewsWaiting === 2 && panel.includes('Human checks waiting: <b>2</b>'));
await tap(900, 'admin');
check('refresh shows it again', lastText(900).includes('🛠 <b>Admin</b>'));

console.log('\nDaily word');
await tap(101, 'word');
check('the settings offer every hour from 06:00 to 23:00', buttonsOf(messages(101).at(-1)).filter((b) => b.callback_data?.startsWith('hour:')).length === 18);
await tap(101, 'hour:3');
check('an hour outside the list is ignored', botUser(101)?.wordHour === undefined);
await tap(101, 'hour:8');
const today = bot.tashkentDay();
check("picking an hour saves it and sends today's word", botUser(101)?.wordHour === 8 && lastText(101).includes('Word of the day') && botUser(101)?.lastWordDay === today);
sent = [];
let r = await bot.sendDailyWords(8);
check('the daily run skips a student who already has today\'s word', r.sent === 0 && messages(101).length === 0);
const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
r = await bot.sendDailyWords(8, tomorrow);
check('the next day brings the next word', r.sent === 1 && botUser(101)?.wordIndex === 2 && botUser(101)?.lastWordDay === bot.tashkentDay(tomorrow));
table(bot.BOT_USERS).set('401', { telegramId: '401', chatId: 401, createdAt: 0, lastUpdateId: 0, step: 'idle', wordHour: 9 });
blocked.add(401);
r = await bot.sendDailyWords(9);
check('a student who blocked the bot is switched off', r.stopped === 1 && botUser(401)?.wordHour === null);
await tap(101, 'hour:off');
check('the word can be turned off', botUser(101)?.wordHour === null);

console.log('\nPosts to every student (api/_lib/broadcast.ts)');
const cast = await import('../api/_lib/broadcast.js');
const text = await import('../api/_lib/telegramText.js');
check('**bold** and _italic_ become Telegram HTML, and everything else is escaped', text.postToHtml('**Hi** <b> & _you_') === '<b>Hi</b> &lt;b&gt; &amp; <i>you</i>');
check('underscores inside a name are left alone', text.postToHtml('@writeready_student_bot') === '@writeready_student_bot');
check('the length counts what students see, not the marks', text.postLength('**Hi** _you_') === 6);
const castError = (fn: () => unknown) => { try { fn(); return ''; } catch (e) { return e instanceof cast.BroadcastError ? e.message : `other: ${String(e)}`; } };
check('an empty post is refused', castError(() => cast.readPost({ text: '  ' })).includes('Write the post'));
check('a post over the caption limit with a picture is refused', castError(() => cast.readPost({ text: 'x'.repeat(1100) }, { photoComing: true })).includes('1024'));
check('a button needs a full https link', castError(() => cast.readPost({ text: 'Hi', button: { text: 'Open', url: 'writeready.uz' } })).includes('https://'));
check('and both its parts', castError(() => cast.readPost({ text: 'Hi', button: { text: '', url: 'https://www.writeready.uz' } })).includes('both'));
const goodPost = cast.readPost({ text: '**New** mock tests are out', button: { text: 'Open WriteReady', url: 'https://www.writeready.uz' } });
check('a good post keeps its text, HTML and button', goodPost.html === '<b>New</b> mock tests are out' && goodPost.button?.url === 'https://www.writeready.uz' && goodPost.photoFileId === null);
check('only JPG, PNG or WebP pictures', castError(() => cast.readPhoto({ name: 'a.gif', type: 'image/gif', base64: 'AAAA' })).includes('JPG'));
check('up to 5 MB', castError(() => cast.readPhoto({ name: 'a.png', type: 'image/png', base64: Buffer.alloc(cast.MAX_PHOTO_BYTES + 1).toString('base64') })).includes('5 MB'));
const upload = cast.readPhoto({ name: 'poster.png', type: 'image/png', base64: Buffer.from('png-bytes').toString('base64') });
check('a picture is read as a file to upload', upload?.field === 'photo' && upload.data.toString() === 'png-bytes' && upload.name === 'poster.png');

// Telegram for this part: pictures get an id, blocked students refuse, one chat is "too fast" once.
const rateLimitedOnce = new Set<number>([204]);
setTestTelegram(async (method, body) => {
  const chat = body.chat_id as number;
  if ((method === 'sendMessage' || method === 'sendPhoto') && blocked.has(chat)) throw new TelegramError(method, 403, 'Forbidden: bot was blocked by the user');
  if ((method === 'sendMessage' || method === 'sendPhoto') && rateLimitedOnce.delete(chat)) throw new TelegramError(method, 429, 'Too Many Requests: retry after 0', 0);
  sent.push({ method, body });
  if (method === 'sendPhoto') return { photo: [{ file_id: 'small-id' }, { file_id: 'big-id' }] };
  return true;
});

sent = [];
const savedAdmins = process.env.TELEGRAM_ADMIN_IDS;
process.env.TELEGRAM_ADMIN_IDS = '';
let testError = '';
await cast.sendTest(goodPost, null).catch((e) => { testError = e.message; });
check('a test needs your Telegram ID in Vercel', testError.includes('TELEGRAM_ADMIN_IDS') && messages().length === 0);
process.env.TELEGRAM_ADMIN_IDS = savedAdmins;
const test = await cast.sendTest(cast.readPost({ text: 'With a picture' }, { photoComing: true }), upload);
const testMsg = sent.find((m) => m.method === 'sendPhoto')?.body;
check('the test goes to the admin, uploading the picture once', test.sentTo === 1 && testMsg?.chat_id === 900 && String(testMsg?.photo).startsWith('<upload poster.png'));
check("and hands back Telegram's id for the picture, the biggest size", test.photoFileId === 'big-id');
check('with the Stop announcements button, as students will see it', JSON.stringify(testMsg?.reply_markup).includes('news:off'));

// Who a post reaches.
table(bot.BOT_USERS).set('801', { telegramId: '801', chatId: 801, createdAt: Date.now(), lastUpdateId: 0, step: 'idle', announcementsOff: true });
table(bot.BOT_USERS).set('802', { telegramId: '802', chatId: 802, createdAt: Date.now(), lastUpdateId: 0, step: 'idle' });
blocked.add(802);
const everyone = [...table(bot.BOT_USERS).values()] as bot.BotUser[];
const aud = await cast.audience();
const expectedReach = everyone.filter((u) => !u.announcementsOff && !u.blocked).length;
check('the audience leaves out students who turned posts off or blocked the bot', aud.students === everyone.length && aud.off === 1 && aud.reach === expectedReach && aud.blocked === everyone.filter((u) => u.blocked).length);

// Send to everyone.
sent = [];
const post = cast.readPost({ text: 'Mock exam week! **All** tests are open.', button: { text: 'Open WriteReady', url: 'https://www.writeready.uz' } });
await cast.startBroadcast('postaaaaaaaa1', post);
check('a post is recorded with who it can reach', table(cast.BROADCASTS).get('postaaaaaaaa1')?.status === 'sending' && table(cast.BROADCASTS).get('postaaaaaaaa1')?.total === expectedReach);
const steps: number[] = [];
const done1 = await cast.runBroadcast('postaaaaaaaa1', Date.now() + 60_000, (p) => steps.push(p.sent));
const receivers = sent.filter((m) => m.method === 'sendMessage').map((m) => m.body.chat_id as number);
check('every student who can receive it gets it once', done1.status === 'done' && receivers.length === new Set(receivers).size && receivers.length === done1.sent);
check('not the ones who turned posts off', !receivers.includes(801));
check('a student who blocked the bot is counted and remembered', done1.blocked >= 1 && botUser(802)?.blocked === true && !receivers.includes(802));
check('"too many at once" waits and tries again', receivers.includes(204));
check('the counts add up', done1.sent + done1.blocked + done1.failed + done1.skipped === everyone.length);
check('progress was reported along the way', steps.length >= 2);
check('with the button and the Stop announcements button', JSON.stringify(sent[0]?.body.reply_markup) === JSON.stringify({ inline_keyboard: [[{ text: 'Open WriteReady', url: 'https://www.writeready.uz' }], [{ text: '🔕 Stop announcements', callback_data: 'news:off' }]] }));
const stored1 = table(cast.BROADCASTS).get('postaaaaaaaa1');
check('the post is marked done, with its numbers', stored1?.status === 'done' && stored1?.sent === done1.sent && typeof stored1?.finishedAt === 'number' && stored1?.leaseUntil === 0);
sent = [];
await cast.startBroadcast('postaaaaaaaa1', post);
const again = await cast.runBroadcast('postaaaaaaaa1', Date.now() + 60_000);
check('pressing send twice (same id) never sends it twice', again.status === 'done' && messages().length === 0 && table(cast.BROADCASTS).size === 1);

// A post cut short by the time limit carries on from where it stopped.
sent = [];
await cast.startBroadcast('postaaaaaaaa2', cast.readPost({ text: 'Second post' }));
const paused = await cast.runBroadcast('postaaaaaaaa2', Date.now() + 150);
check('at the time limit it pauses, part way', paused.paused && paused.status === 'sending' && paused.sent > 0 && paused.sent < expectedReach);
let secondError = '';
await cast.startBroadcast('postaaaaaaaa3', cast.readPost({ text: 'Third post' })).catch((e) => { secondError = e.message; });
check('a new post waits until that one is finished', secondError.includes('still being sent') && !table(cast.BROADCASTS).has('postaaaaaaaa3'));
table(cast.BROADCASTS).set('postaaaaaaaa2', { ...table(cast.BROADCASTS).get('postaaaaaaaa2'), leaseUntil: Date.now() + 60_000 });
const held = await cast.runBroadcast('postaaaaaaaa2', Date.now() + 60_000);
check('while another run holds it, a second run sends nothing', held.busy && sent.length === paused.sent);
table(cast.BROADCASTS).set('postaaaaaaaa2', { ...table(cast.BROADCASTS).get('postaaaaaaaa2'), leaseUntil: 0 });
check('the hourly job finishes it', (await cast.continueBroadcasts(Date.now() + 60_000)) === 1 && table(cast.BROADCASTS).get('postaaaaaaaa2')?.status === 'done');
const second = sent.filter((m) => m.method === 'sendMessage').map((m) => m.body.chat_id as number);
check('and nobody got it twice', second.length === new Set(second).size && second.length === table(cast.BROADCASTS).get('postaaaaaaaa2')?.sent);
const recentPosts = await cast.recentBroadcasts();
check('recent posts come newest first, with their numbers', recentPosts.length === 2 && recentPosts[0].createdAt >= recentPosts[1].createdAt && recentPosts.every((r) => r.status === 'done' && !r.active));

// The student's side.
setTestTelegram(baseTelegram);
await tap(301, 'news:off');
check('"Stop announcements" turns them off, and says what still works', botUser(301)?.announcementsOff === true && lastText(301).includes('No more announcements') && lastText(301).includes('daily word'));
await say(301, '/account');
check('/account shows it, with a switch to turn them back on', lastText(301).includes('Announcements from WriteReady: <b>off</b>') && buttonsOf(messages(301).at(-1)).some((b) => b.callback_data === 'news:on'));
await tap(301, 'news:on');
check('and back on', botUser(301)?.announcementsOff === false);
blocked.delete(802);
await say(802, '/start');
check('a student who blocked the bot and writes again is no longer skipped', botUser(802)?.blocked === false);

console.log('\nCron hour and webhook secret');
check('the cron header maps to Tashkent time', tashkentHour('0 3 * * *') === 8 && tashkentHour('0 18 * * *') === 23);
check('without the header it uses the current Tashkent hour', tashkentHour(undefined, new Date(Date.UTC(2026, 0, 1, 20))) === 1);
check('the webhook secret is stable and in the allowed characters', webhookSecret('123:abc') === webhookSecret('123:abc') && /^[0-9a-f]{48}$/.test(webhookSecret('123:abc')));
check('a different token gives a different secret', webhookSecret('123:abc') !== webhookSecret('123:abd'));

console.log('\nReading the AI reply (api/_lib/routes/telegram.ts)');
// The webhook module brings the real marking with it; a Firebase app with no
// credentials lets its handler run without ever reaching the live database.
const { initializeApp, getApps } = await import('firebase-admin/app');
if (!getApps().length) initializeApp({ projectId: 'offline-test' });
const webhook = await import('../api/_lib/routes/telegram.js');
const reply = JSON.stringify({ topic: 'Education', bandRationale: {}, scores: { taskAchievement: 6, coherenceCohesion: 6.5, lexicalResource: 6, grammaticalRangeAccuracy: 5.5 }, topMistakes: ['First.', '', 7, 'Second.', 'Third.', 'Fourth.'] });
const read = webhook.readCheck(`Here it is:\n${reply}`);
check('the bands are read and the overall worked out', read.scores.overall === 6 && read.scores.coherenceCohesion === 6.5);
check('at most three mistakes, empty or odd ones dropped', JSON.stringify(read.mistakes) === JSON.stringify(['First.', 'Second.', 'Third.']));
check('a reply without mistakes still works', webhook.readCheck(JSON.stringify({ scores: { taskAchievement: 7, coherenceCohesion: 7, lexicalResource: 7, grammaticalRangeAccuracy: 7 } })).mistakes.length === 0);
let noScores = false;
try { webhook.readCheck('{"topic":"x"}'); } catch { noScores = true; }
check('a reply without real scores counts as a failed check', noScores);

console.log('\nWebhook security');
process.env.TELEGRAM_STUDENT_BOT_TOKEN = '123:abc';
let lastJson: Record<string, unknown> = {};
const call = async (secret: string | undefined, body: unknown, method = 'POST', query: Record<string, string> = {}) => {
  let status = 0;
  const res = { status: (c: number) => { status = c; return res; }, end: () => res, json: (j: Record<string, unknown>) => { lastJson = j; return res; } };
  await webhook.default({ method, query, headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {}, body } as never, res as never);
  return status;
};
const good = webhookSecret('123:abc');
check('a request without the secret is refused', (await call(undefined, { update_id: 1 })) === 401);
check('a request with the wrong secret is refused', (await call('x'.repeat(48), { update_id: 1 })) === 401);
check('only GET and POST are accepted', (await call(good, {}, 'PUT')) === 405);

console.log('\nConnecting the bot to Telegram');
let webhookUrl = '';
setTestTelegram(async (method, body) => {
  sent.push({ method, body });
  if (method === 'getWebhookInfo') return { url: webhookUrl, pending_update_count: 2, last_error_message: webhookUrl ? undefined : 'never set' };
  if (method === 'setWebhook') webhookUrl = String(body.url);
  return true;
});
sent = [];
check('opening the address connects the bot', (await call(undefined, undefined, 'GET')) === 200 && webhookUrl === bot.WEBHOOK_URL);
const setCall = sent.find((s) => s.method === 'setWebhook')?.body;
check('with the secret and only the updates the bot uses', setCall?.secret_token === good && JSON.stringify(setCall?.allowed_updates) === '["message","callback_query"]');
check('and the command menu', JSON.stringify(((sent.find((s) => s.method === 'setMyCommands')?.body.commands ?? []) as { command: string }[]).map((c) => c.command)) === '["check","account","invite","word","help","cancel","contact"]');
const adminMenu = sent.find((s) => s.method === 'setMyCommands' && s.body.scope)?.body;
check("with /admin only in the admin's own chat", JSON.stringify(adminMenu?.scope) === '{"type":"chat","chat_id":900}' && ((adminMenu?.commands ?? []) as { command: string }[]).some((c) => c.command === 'admin'));
check('the webhook address is the site itself, not a redirect', bot.WEBHOOK_URL === 'https://www.writeready.uz/api/telegram');
check("and reports Telegram's own status", lastJson.connected === true && lastJson.changed === true && lastJson.pending === 2 && lastJson.lastError === null);
sent = [];
await call(undefined, undefined, 'GET');
check('opening it again only reports', !sent.some((s) => s.method === 'setWebhook') && lastJson.changed === false);
sent = [];
await call(undefined, undefined, 'GET', { force: '1' });
check('?force=1 sets it all again, with this server\'s secret', sent.find((s) => s.method === 'setWebhook')?.body.secret_token === good && lastJson.changed === true);
sent = [];
check("Telegram's own request is accepted", (await call(good, { update_id: ++updateId, message: { chat: { id: 501, type: 'private' }, from: { id: 501 }, text: '/start' } })) === 200);
check('and the bot answers it', lastText(501).includes('Send me an IELTS Writing Task 2 essay'));
check('a malformed update still gets 200, so Telegram does not resend it forever', (await call(good, { nonsense: true })) === 200);

console.log('\nKeeping the menu up to date');
const onTelegram: Record<string, unknown> = { commands: [{ command: 'check', description: 'Check a Task 2 essay' }], short: 'old', long: 'old' };
let setCalls: Sent[] = [];
setTestTelegram(async (method, body) => {
  const key = body.scope ? `admin${(body.scope as { chat_id: number }).chat_id}` : 'commands';
  if (method === 'getMyCommands') return onTelegram[key] ?? [];
  if (method === 'getMyShortDescription') return { short_description: onTelegram.short };
  if (method === 'getMyDescription') return { description: onTelegram.long };
  setCalls.push({ method, body });
  if (method === 'setMyCommands') onTelegram[key] = body.commands;
  if (method === 'setMyShortDescription') onTelegram.short = body.short_description;
  if (method === 'setMyDescription') onTelegram.long = body.description;
  return true;
});
check('an old menu on Telegram is brought up to date', (await bot.syncBotProfile()) === true && JSON.stringify(onTelegram.commands) === JSON.stringify(bot.COMMANDS));
check('with the descriptions and the admin menu', onTelegram.short !== 'old' && String(onTelegram.long).includes('every 2 weeks') && ((onTelegram.admin900 ?? []) as { command: string }[]).some((c) => c.command === 'admin'));
setCalls = [];
check('when nothing changed it only reads', (await bot.syncBotProfile()) === false && setCalls.length === 0);
onTelegram.admin900 = [];
check("a new admin's menu is set on its own", (await bot.syncBotProfile()) === true && setCalls.length === 1 && setCalls[0].method === 'setMyCommands');

console.log('\nHousekeeping');
for (const id of [...table(bot.BOT_LINKS).keys()]) table(bot.BOT_LINKS).delete(id);
table(bot.BOT_LINKS).set('goneaaaaaaa1', { telegramId: '1', expiresAt: Date.now() - 1 });
table(bot.BOT_LINKS).set('goneaaaaaaa2', { telegramId: '2', expiresAt: Date.now() - DAY });
table(bot.BOT_LINKS).set('keptaaaaaaaa', { telegramId: '3', expiresAt: Date.now() + DAY });
check('expired links are deleted, at most the limit in one run', (await bot.deleteExpiredLinks(Date.now(), 1)) === 1 && table(bot.BOT_LINKS).size === 2);
check('the next run takes the rest, and live links stay', (await bot.deleteExpiredLinks()) === 1 && [...table(bot.BOT_LINKS).keys()].join() === 'keptaaaaaaaa');
table(bot.BOT_LINKS).set('goneaaaaaaa3', { telegramId: '4', expiresAt: Date.now() - 1 });
const daily = (await import('../api/_lib/routes/botDaily.js')).default;
let dailyJson: Record<string, unknown> = {};
let dailyStatus = 0;
const dailyRes = { status: (c: number) => { dailyStatus = c; return dailyRes; }, json: (j: Record<string, unknown>) => { dailyJson = j; return dailyRes; } };
await daily({ headers: { 'x-vercel-cron-schedule': '0 3 * * *' } } as never, dailyRes as never);
check('the hourly job runs it all', dailyStatus === 200 && dailyJson.hour === 8 && dailyJson.linksDeleted === 1 && dailyJson.profileUpdated === false && typeof dailyJson.words === 'object' && typeof dailyJson.reminders === 'object');

console.log('\nThe shared function (api/combined.ts)');
const combined = (await import('../api/combined.js')).default;
const viaRouter = async (route: string | undefined, method: string, headers: Record<string, string> = {}, body: unknown = undefined) => {
  let status = 0;
  const res = { status: (c: number) => { status = c; return res; }, end: () => res, json: () => res, setHeader: () => res };
  await combined({ method, query: route === undefined ? {} : { route }, headers, body } as never, res as never);
  return status;
};
check('an unknown route is not found', (await viaRouter('nope', 'GET')) === 404);
check('no route is not found', (await viaRouter(undefined, 'GET')) === 404);
check('a name inherited by every object is not a route', (await viaRouter('constructor', 'GET')) === 404);
check('/api/telegram reaches the webhook, which still wants the secret', (await viaRouter('telegram', 'POST', {}, { update_id: 1 })) === 401);
check('/api/bot-link reaches the link handler, which wants a signed-in student', (await viaRouter('bot-link', 'POST', {}, { code: 'x' })) === 401);
check('/api/bot-broadcast wants the admin signed in', (await viaRouter('bot-broadcast', 'POST', {}, { action: 'overview' })) === 401);
check('and a real token, not any text', (await viaRouter('bot-broadcast', 'POST', { authorization: 'Bearer not-a-token' }, { action: 'overview' })) === 401);
check('and only takes POST', (await viaRouter('bot-broadcast', 'GET')) === 405);
check('/api/seen still answers a browser check before the stamp', (await viaRouter('seen', 'OPTIONS')) === 200 && (await viaRouter('seen', 'GET')) === 405);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
