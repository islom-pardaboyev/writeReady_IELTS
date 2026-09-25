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
const { tashkentHour } = await import('../api/bot-daily.js');

// ── Firestore stand-in ──────────────────────────────────────────────────────

type Data = Record<string, unknown>;
const collections = new Map<string, Map<string, Data>>();
const table = (name: string) => {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
};
let autoId = 0;
const resolve = (data: Data): Data =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof FieldValue ? Timestamp.now() : v]));

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
      table(name).set(id, { ...before, ...resolve(data) });
    },
    snapshot,
  };
  return ref;
}
type Ref = ReturnType<typeof docRef>;

function query(name: string, filters: [string, unknown][]) {
  return {
    where: (field: string, op: string, value: unknown) => {
      if (op !== '==') throw new Error(`stand-in only supports ==, not ${op}`);
      return query(name, [...filters, [field, value]]);
    },
    get: async () => ({
      docs: [...table(name).entries()]
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .map(([id]) => ({ ...docRef(name, id).snapshot(), ref: docRef(name, id) })),
    }),
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
setTestTelegram(async (method, body) => {
  if (method === 'sendMessage' && blocked.has(body.chat_id as number)) throw new TelegramError(method, 403, 'Forbidden: bot was blocked by the user');
  sent.push({ method, body });
  if (method === 'getMe') return { username: 'WriteReadyTestBot' };
  return true;
});
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
check('an essay under the minimum is refused without charging', markCalls === 0 && (botUser(101)?.weekCount ?? 0) === 0 && botUser(101)?.step === 'essay');

await tap(101, 'cancel');
await submitEssay(101);
await tap(101, 'go');
const result = messages(101).at(-1);
const u101 = botUser(101)!;
check('the AI marks the essay once', markCalls === 1);
check("this week's free check is spent", u101.weekKey === currentWeekKey() && u101.weekCount === 1);
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
check('a second check the same week says none are left', lastText(101).includes("You've used this week's free check") && botUser(101)?.step === 'idle');

console.log('\nOne check at a time, and failures');
await say(103, '/start');
await submitEssay(103);
markDelayMs = 20;
const calls = markCalls;
await Promise.all([tap(103, 'go'), tap(103, 'go')]);
markDelayMs = 0;
check('two taps on the button mark the essay once', markCalls === calls + 1 && botUser(103)?.weekCount === 1);

await say(104, '/start');
await submitEssay(104);
markFails = true;
await tap(104, 'go');
markFails = false;
check('a failed marking gives the check back', (botUser(104)?.weekCount ?? 0) === 0 && botUser(104)?.step === 'essay');
check('and says the student was not charged', lastText(104).includes('not charged'));
await tap(104, 'go');
check('trying again then works', lastText(104).includes('Estimated band') && botUser(104)?.weekCount === 1);

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

console.log('\nConnecting the site account');
check('an unknown code opens nothing', (await bot.openLink('unknowncode123', 'uidA')) === null);
check('a malformed code opens nothing', (await bot.openLink('../../users', 'uidA')) === null);
table('users').set('uidA', { email: 'a@example.com', plan: 'free' });
sent = [];
const opened = await bot.openLink(code, 'uidA');
check('a valid code returns the essay', opened?.essay === ESSAY && opened?.question === QUESTION);
check('it connects the Telegram account', botUser(101)?.uid === 'uidA');
check("this week's bot check carries over to the account", (table('users').get('uidA')?.freeUsage as { count?: number })?.count === 1);
check('the student is told in Telegram', lastText(101).includes('now connected'));
sent = [];
await bot.openLink(code, 'uidA');
await bot.openLink(code, 'uidB');
check('opening it again changes nothing', botUser(101)?.uid === 'uidA' && messages(101).length === 0);
table(bot.BOT_LINKS).set('expiredcode12', { telegramId: '104', question: QUESTION, essay: ESSAY, expiresAt: Date.now() - 1 });
check('an expired link opens nothing', (await bot.openLink('expiredcode12', 'uidA')) === null);
const codeOf = (userId: number) => (buttonsOf(messages(userId).at(-1)).find((b) => b.url?.includes('/tg/'))?.url ?? '').split('/tg/')[1];
await submitEssay(203);
await tap(203, 'go');
const code203 = codeOf(203);
check('an account the site has not finished creating is not connected yet', (await bot.openLink(code203, 'uidNew'))?.essay === ESSAY && botUser(203)?.uid === undefined);

console.log('\nA connected student');
table('users').set('uidC', { email: 'c@example.com', plan: 'free', freeUsage: { weekKey: currentWeekKey(), count: 1 } });
table(bot.BOT_USERS).set('301', { telegramId: '301', chatId: 301, createdAt: 0, lastUpdateId: 0, step: 'idle', uid: 'uidC' });
await tap(301, 'check');
check('a free report used on the site this week leaves none in the bot', lastText(301).includes("You've used this week's free check"));
table('users').set('uidC', { email: 'c@example.com', plan: 'free' });
await submitEssay(301);
await tap(301, 'go');
check("the check is counted on the account, shared with the site", (table('users').get('uidC')?.freeUsage as { count?: number })?.count === 1 && botUser(301)?.weekCount === undefined);
check('and saved to their history on the site', saved.some((s) => s.uid === 'uidC' && s.band === 6));

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

console.log('\nCron hour and webhook secret');
check('the cron header maps to Tashkent time', tashkentHour('0 3 * * *') === 8 && tashkentHour('0 18 * * *') === 23);
check('without the header it uses the current Tashkent hour', tashkentHour(undefined, new Date(Date.UTC(2026, 0, 1, 20))) === 1);
check('the webhook secret is stable and in the allowed characters', webhookSecret('123:abc') === webhookSecret('123:abc') && /^[0-9a-f]{48}$/.test(webhookSecret('123:abc')));
check('a different token gives a different secret', webhookSecret('123:abc') !== webhookSecret('123:abd'));

console.log('\nReading the AI reply (api/telegram.ts)');
// The webhook module brings the real marking with it; a Firebase app with no
// credentials lets its handler run without ever reaching the live database.
const { initializeApp, getApps } = await import('firebase-admin/app');
if (!getApps().length) initializeApp({ projectId: 'offline-test' });
const webhook = await import('../api/telegram.js');
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
const call = async (secret: string | undefined, body: unknown, method = 'POST') => {
  let status = 0;
  const res = { status: (c: number) => { status = c; return res; }, end: () => res, json: () => res };
  await webhook.default({ method, headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {}, body } as never, res as never);
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
  if (method === 'getWebhookInfo') return { url: webhookUrl };
  if (method === 'setWebhook') webhookUrl = String(body.url);
  return true;
});
sent = [];
check('opening the address connects the bot', (await call(undefined, undefined, 'GET')) === 200 && webhookUrl === bot.WEBHOOK_URL);
const setCall = sent.find((s) => s.method === 'setWebhook')?.body;
check('with the secret and only the updates the bot uses', setCall?.secret_token === good && JSON.stringify(setCall?.allowed_updates) === '["message","callback_query"]');
check('and the command menu', JSON.stringify(((sent.find((s) => s.method === 'setMyCommands')?.body.commands ?? []) as { command: string }[]).map((c) => c.command)) === '["check","invite","word","help","cancel"]');
check('the webhook address is the site itself, not a redirect', bot.WEBHOOK_URL === 'https://www.writeready.uz/api/telegram');
sent = [];
await call(undefined, undefined, 'GET');
check('opening it again changes nothing', !sent.some((s) => s.method === 'setWebhook'));
sent = [];
check("Telegram's own request is accepted", (await call(good, { update_id: ++updateId, message: { chat: { id: 501, type: 'private' }, from: { id: 501 }, text: '/start' } })) === 200);
check('and the bot answers it', lastText(501).includes('Send me an IELTS Writing Task 2 essay'));
check('a malformed update still gets 200, so Telegram does not resend it forever', (await call(good, { nonsense: true })) === 200);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
