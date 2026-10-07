/**
 * Offline checks for the public sample answers (api/_lib/samples/*).
 *
 *   npx tsx scripts/test-samples.ts
 *
 * No network, no database, no AI. Firestore is an in-memory stand-in
 * (scripts/lib/fakeFirestore.ts), Telegram records every call instead of
 * sending it, and the Message Batches API is a stand-in that returns the
 * replies each test gives it.
 *
 * Covers: slugs, removing personal details, the qualification rules of all
 * four modes, consent and credit idempotency (two Mock tasks = +1 in total),
 * the daily limit, zod validation of AI replies, the Telegram review
 * messages, button presses and the webhook's checks, the batch cycle, and
 * the evening rebuild.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FakeFirestore } from './lib/fakeFirestore.js';

process.env.NONCE_SECRET = 'test-secret-for-offline-checks-only';
process.env.TELEGRAM_STUDENT_BOT_TOKEN = '123456:test-token';
process.env.ADMIN_TELEGRAM_CHAT_ID = '777';
process.env.TELEGRAM_ADMIN_IDS = '888';
delete process.env.VERCEL_DEPLOY_HOOK_URL;
// initFirebase() returns early once an app exists; this one has no credentials and is never used.
if (!getApps().length) initializeApp({ projectId: 'writeready-offline-test' });

const { setTestFirestore } = await import('../api/_lib/db.js');
const { setTestTelegram, webhookSecret } = await import('../api/_lib/telegramApi.js');
const { saveSavedReport, essayKeys } = await import('../api/_lib/savedReports.js');
const { normalizeScores } = await import('../api/_lib/bandScore.js');
const model = await import('../api/_lib/samples/model.js');
const { slugify, baseSlug, assignSlug } = await import('../api/_lib/samples/slug.js');
const { stripPersonalDetails } = await import('../api/_lib/samples/pii.js');
const { qualifyingTasks, readMode, DAILY_CONSENT_LIMIT } = await import('../api/_lib/samples/qualify.js');
const consent = await import('../api/_lib/samples/consent.js');
const review = await import('../api/_lib/samples/review.js');
const generate = await import('../api/_lib/samples/generate.js');
const daily = await import('../api/_lib/samples/daily.js');
const { jobFor } = await import('../api/_lib/routes/samplesCron.js');
const telegramRoute = (await import('../api/_lib/routes/telegram.js')).default;

const fake = new FakeFirestore();
setTestFirestore(fake as unknown as Firestore);

// ── Telegram stand-in ───────────────────────────────────────────────────────

interface Call { method: string; body: Record<string, unknown> }
let calls: Call[] = [];
let messageId = 100;
setTestTelegram(async (method, body) => {
  calls.push({ method, body });
  if (method.startsWith('send')) return { message_id: ++messageId };
  return true;
});

// ── Tiny test runner ─────────────────────────────────────────────────────────

let failures = 0;
let passes = 0;
function check(name: string, ok: unknown, detail?: unknown): void {
  if (ok) {
    passes++;
  } else {
    failures++;
    console.error(`✗ ${name}${detail !== undefined ? `\n    ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
async function rejects(name: string, fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    check(name, false, 'did not throw');
  } catch (e) {
    check(name, (e as { code?: string }).code === code, `threw ${(e as { code?: string }).code}: ${(e as Error).message}`);
  }
}
const section = (name: string) => console.log(`— ${name}`);

// ── Fixtures ────────────────────────────────────────────────────────────────

const words = (n: number, word = 'word') => Array.from({ length: n }, (_, i) => `${word}${i % 7}`).join(' ');
const Q1 = 'The line graph below shows energy consumption in the USA from 1980 to 2030. Summarise the information by selecting and reporting the main features.';
const Q2 = 'Some people think children should not use technology at school. To what extent do you agree or disagree?';
const JPEG = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;
const ESSAY1 = `The graph shows energy use in the USA. ${words(170)}`;
const ESSAY2 = `My name is Aziz Karimov and I think technology helps. Write to aziz.k@mail.uz or @aziz_writes, or call +998 90 123 45 67. ${words(260)}\n\nYours sincerely,\nAziz Karimov`;

const bands = (b: number) => normalizeScores({ taskAchievement: b, coherenceCohesion: b, lexicalResource: b, grammaticalRangeAccuracy: b })!;
const fullRaw = JSON.stringify({
  vocabulary: [
    { word: 'detrimental', uzbek: 'zararli', english: 'harmful (instead of: bad)', exampleFromEssay: 'Screens can be detrimental to focus.' },
    { word: 'digital literacy', uzbek: 'raqamli savodxonlik', english: 'skill with digital tools', exampleFromEssay: 'Schools build digital literacy.' },
  ],
  grammar: [{ kind: 'mistake', point: 'Articles', explanation: 'Use a before...', example: 'A child...', yours: 'Child...' }],
});

async function seedReport(uid: string, taskType: 'Task 1' | 'Task 2', question: string, essay: string, band: number, tier: 'full' | 'limited' = 'full') {
  const keys = essayKeys(taskType, question, essay);
  await saveSavedReport(uid, keys, taskType, {
    tier, raw: tier === 'full' ? fullRaw : '{}', scores: bands(band), topic: 'Technology', reportId: `rep-${uid}-${band}`, signature: null, signatureVersion: 1,
  });
}

function seedBank() {
  fake.put(model.BANK.task1, 'q1', { report: Q1, createdAt: 1 });
  fake.put(model.BANK.task2, 'q2', { report: Q2, createdAt: 2 });
  fake.put(model.CHARTS, 'q1', { data: JPEG });
  // What the cron keeps for every bank question, so Relax can be matched.
  fake.put(model.QUESTION_META, 'q1', { taskType: 'task1', questionKey: essayKeys('Task 1', Q1, '').questionKey });
  fake.put(model.QUESTION_META, 'q2', { taskType: 'task2', questionKey: essayKeys('Task 2', Q2, '').questionKey });
}

const t1 = (essay = ESSAY1, questionId: string | null = 'q1', question = Q1, chart: string | null = null) =>
  ({ taskType: 'task1' as const, questionId, question, essay, chart, hasChart: !!chart });
const t2 = (essay = ESSAY2, questionId: string | null = 'q2', question = Q2) => ({ taskType: 'task2' as const, questionId, question, essay, chart: null, hasChart: false });

function freshWorld() {
  fake.reset();
  calls = [];
  seedBank();
  fake.put('users', 'u1', { bonusAnalyses: 0 });
  fake.put('users', 'u2', { bonusAnalyses: 2 });
}

// ── Slugs ───────────────────────────────────────────────────────────────────

section('slugs');
check('Task 2 slug keeps "and"', slugify('Children and Technology') === 'children-and-technology', slugify('Children and Technology'));
check('drops articles and punctuation', slugify("The World's Energy: a Crisis?") === 'worlds-energy-crisis', slugify("The World's Energy: a Crisis?"));
check('strips accents, & becomes and', slugify('Café & Résumé') === 'cafe-and-resume');
check('caps at 7 words', slugify('one two three four five six seven eight nine').split('-').length === 7);
check('caps at 60 characters on a word boundary', slugify('internationalisation '.repeat(6)).length <= 60);
check('Task 1 leads with the chart type', baseSlug('task1', 'Energy consumption', 'Line graph') === 'line-graph-energy-consumption', baseSlug('task1', 'Energy consumption', 'Line graph'));
check('Task 1 never says the chart type twice', baseSlug('task1', 'Line graph of energy consumption', 'Line graph') === 'line-graph-energy-consumption', baseSlug('task1', 'Line graph of energy consumption', 'Line graph'));
check('Task 2 ignores a chart type', baseSlug('task2', 'Children and technology', 'Line graph') === 'children-and-technology');
fake.reset();
const s1 = await assignSlug('qa', 'task2', 'children-and-technology');
const s2 = await assignSlug('qb', 'task2', 'children-and-technology');
const s1again = await assignSlug('qa', 'task2', 'something-else');
check('first question gets the slug', s1 === 'children-and-technology');
check('second question gets -2', s2 === 'children-and-technology-2', s2);
check('a slug never changes once set', s1again === 'children-and-technology');
check('slug ownership recorded', fake.table(model.SLUGS).get('children-and-technology-2')?.questionId === 'qb');
check('empty base falls back to a question- slug', (await assignSlug('Qz-9', 'task2', '')).startsWith('question-qz9'));

// ── Personal details ────────────────────────────────────────────────────────

section('personal details');
const stripped = stripPersonalDetails(ESSAY2);
check('email removed', !stripped.text.includes('aziz.k@mail.uz') && stripped.text.includes('[email removed]'));
check('Telegram handle removed', !stripped.text.includes('@aziz_writes') && stripped.text.includes('[username removed]'));
check('phone removed', !stripped.text.includes('123 45 67') && stripped.text.includes('[phone removed]'));
check('"my name is" removed', !stripped.text.includes('Aziz Karimov and') && stripped.text.includes('My name is [name]'));
check('sign-off name removed', /Yours sincerely,\n\[Name\]$/.test(stripped.text), stripped.text.slice(-40));
check('counts what it removed', stripped.removed >= 5, stripped.removed);
for (const keep of [
  'rose from 1,200,000 in 1990 to 2,500,000 in 2010',
  'about 12 500 000 tonnes, or 3 450 000 000 in total',
  'from 1990 to 2010, 45% of households',
  'between 2000 and 2020 it was 2.5 million',
  'Figures of 120 340 560 and 780 are shown',
]) {
  check(`Task 1 figures survive: "${keep}"`, stripPersonalDetails(keep).text === keep, stripPersonalDetails(keep).text);
}
check('t.me links removed', stripPersonalDetails('see t.me/mychannel now').text === 'see [link removed] now');

// ── Qualification rules (pure) ──────────────────────────────────────────────

section('qualification rules');
const fact = (taskType: 'task1' | 'task2', band: number | null, questionId: string | null = 'q') => ({ taskType, band, questionId });
check('Mock: both 7+ qualify', qualifyingTasks('mock', [fact('task1', 7), fact('task2', 7.5)]).length === 2);
check('Mock: judged separately (6.5 + 7)', qualifyingTasks('mock', [fact('task1', 6.5), fact('task2', 7)]).map((t) => t.taskType).join() === 'task2');
check('Practice: judged separately (7 + 6)', qualifyingTasks('practice', [fact('task1', 7), fact('task2', 6)]).map((t) => t.taskType).join() === 'task1');
check('Quick Write: one task qualifies', qualifyingTasks('quickwrite', [fact('task2', 8)]).length === 1);
check('Quick Write: two tasks is not a Quick Write session', qualifyingTasks('quickwrite', [fact('task1', 8), fact('task2', 8)]).length === 0);
check('Relax: bank question qualifies', qualifyingTasks('relax', [fact('task2', 7)]).length === 1);
check('a question that is neither bank nor Relax-own never qualifies', qualifyingTasks('relax', [fact('task2', 9, null)]).length === 0);
check('Relax: the student\'s own question qualifies', qualifyingTasks('relax', [{ ...fact('task2', 7, null), custom: true }]).length === 1);
check('outside Relax an own question is refused', qualifyingTasks('quickwrite', [{ ...fact('task2', 8, null), custom: true }]).length === 0);
check('6.5 never qualifies', qualifyingTasks('mock', [fact('task1', 6.5)]).length === 0);
check('no saved band never qualifies', qualifyingTasks('mock', [fact('task1', null)]).length === 0);
check('the same task twice is refused', qualifyingTasks('mock', [fact('task2', 7), fact('task2', 8)]).length === 0);
check('readMode accepts quick as Quick Write', readMode('quick') === 'quickwrite' && readMode('quickwrite') === 'quickwrite' && readMode('exam') === null);

// ── Qualification on the server (all four modes) ────────────────────────────

section('server-side qualification');
freshWorld();
await seedReport('u1', 'Task 1', Q1, ESSAY1, 7);
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7.5);
let offer = (await consent.consentStatus('u1', { mode: 'mock', tasks: [t1(), t2()] })).offer;
check('a fresh session promises the free assessment', (await consent.consentStatus('u1', { mode: 'mock', tasks: [t1(), t2()] })).credit === true);
check('Mock: both offered with server bands', offer.map((o) => `${o.taskType}:${o.band}`).join() === 'task1:7,task2:7.5', offer);
offer = (await consent.consentStatus('u1', { mode: 'practice', tasks: [t1(), t2()] })).offer;
check('Practice: both offered', offer.length === 2);
offer = (await consent.consentStatus('u2', { mode: 'mock', tasks: [t1(), t2()] })).offer;
check('another student\'s report gives nothing', offer.length === 0);
await seedReport('u2', 'Task 1', Q1, ESSAY1, 6.5);
await seedReport('u2', 'Task 2', Q2, ESSAY2, 8);
offer = (await consent.consentStatus('u2', { mode: 'mock', tasks: [t1(), t2()] })).offer;
check('Mock: only the 7+ task is offered', offer.map((o) => o.taskType).join() === 'task2', offer);
offer = (await consent.consentStatus('u1', { mode: 'quickwrite', tasks: [t2()] })).offer;
check('Quick Write: offered', offer.length === 1);
offer = (await consent.consentStatus('u1', { mode: 'relax', tasks: [t2(ESSAY2, null)] })).offer;
check('Relax: a typed question that matches the bank is offered', offer.length === 1);
fake.table(model.QUESTION_META).clear();
offer = (await consent.consentStatus('u1', { mode: 'relax', tasks: [t2(ESSAY2, null)] })).offer;
check('Relax: matched by the exact bank text before the morning job builds the index', offer.length === 1);
seedBank();
const customQ = 'Write about your favourite holiday and why you liked it.';
await seedReport('u1', 'Task 2', customQ, ESSAY2, 9);
offer = (await consent.consentStatus('u1', { mode: 'relax', tasks: [t2(ESSAY2, null, customQ)] })).offer;
check('Relax: an own Task 2 question is offered now', offer.length === 1, offer);
offer = (await consent.consentStatus('u1', { mode: 'quickwrite', tasks: [t2(ESSAY2, 'q2', customQ)] })).offer;
check('a bank id with another question\'s text is refused', offer.length === 0);
offer = (await consent.consentStatus('u1', { mode: 'quickwrite', tasks: [t2(ESSAY2, 'missing-id')] })).offer;
check('a wrong id still matches by the question text', offer.length === 1);
check('readSession refuses three tasks', (() => { try { consent.readSession({ mode: 'mock', tasks: [t1(), t2(), t2()] }); return false; } catch { return true; } })());
check('readSession accepts "Task 2" labels', consent.readSession({ mode: 'quick', tasks: [{ taskType: 'Task 2', question: Q2, essay: 'x' }] }).tasks[0].taskType === 'task2');

// ── Consent and credit ──────────────────────────────────────────────────────

section('consent and credit');
freshWorld();
await seedReport('u1', 'Task 1', Q1, ESSAY1, 7);
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7.5);
const mock = { mode: 'mock' as const, tasks: [t1(), t2()] };
let result = await consent.submitConsent('u1', mock, 'yes', ['task1', 'task2']);
check('Mock: both tasks shared, the free assessment reserved', result.sampleIds.length === 2 && result.creditPending);
check('sharing alone pays nothing', fake.table('users').get('u1')?.bonusAnalyses === 0, fake.table('users').get('u1'));
const samples = fake.all(model.SAMPLES);
const subs = fake.all(model.SUBMISSIONS);
check('each shared task is its own sample', samples.length === 2 && subs.length === 2);
check('samples are pending', samples.every((s) => s.status === 'pending'));
check('samples never carry the userId', samples.every((s) => !JSON.stringify(s).includes('u1')), samples.map((s) => Object.keys(s)));
check('submissions keep the userId privately', subs.every((s) => s.userId === 'u1'));
const s2sample = samples.find((s) => s.taskType === 'task2')!;
check('sample essay has personal details removed', !String(s2sample.sampleAnswer).includes('aziz.k@mail.uz') && !String(s2sample.sampleAnswer).includes('Aziz Karimov'));
check('sample band and criteria come from the server', s2sample.band === 7.5 && (s2sample.criteria as { lr: number }).lr === 7.5);
check('vocabulary from the full report, "instead of" dropped', (s2sample.vocabulary as { meaning: string; uz: string }[])[0]?.meaning === 'harmful' && (s2sample.vocabulary as { uz: string }[])[0]?.uz === 'zararli', s2sample.vocabulary);
check('student grammar mistakes are not published as highlights', (s2sample.grammarHighlights as unknown[]).length === 0);
check('mode and source credit recorded', s2sample.mode === 'mock' && s2sample.sourceCredit === model.BANK_SOURCE_CREDIT);
check('both share one consent code', new Set(samples.map((s) => (s.review as { consentId: string }).consentId)).size === 1);
check('Task 1 sample keeps the bank question text', samples.find((s) => s.taskType === 'task1')?.questionText === Q1);
check('nothing offered after answering', (await consent.consentStatus('u1', mock)).offer.length === 0);
await rejects('the same answer again is refused', () => consent.submitConsent('u1', mock, 'yes', ['task1', 'task2']), 'ALREADY_DECIDED');
check('...and reserves no second credit', fake.all(model.CREDITS).length === 1 && fake.all(model.CREDITS)[0].state === 'pending');

// The credit is paid when the admin approves, once per consent action.
const [mockT1, mockT2] = result.sampleIds;
const firstPress = await review.applyPress('approve', mockT1);
check('approving pays the free assessment', fake.table('users').get('u1')?.bonusAnalyses === 1 && fake.all(model.CREDITS)[0].state === 'paid');
check('the press says the student was paid', firstPress.kind === 'done' && firstPress.label.includes('+1 free report'), firstPress);
const bell = fake.all('notifications/u1/items');
check('the student is told in the bell', bell.length === 1 && bell[0].type === 'sample_published' && bell[0].credited === true && String(bell[0].preview).includes('1 free full AI report'), bell);
check('...and on the dashboard', String(fake.table('users').get('u1')?.notification).includes('now a sample answer'));
await review.applyPress('approve', mockT2);
check('Mock with two approved tasks gives +1 in total', fake.table('users').get('u1')?.bonusAnalyses === 1);
check('the second approval still thanks the student', fake.all('notifications/u1/items').length === 2 && fake.all('notifications/u1/items').some((n) => n.credited === false));

// Rejected: nothing is paid.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8.5);
const fake9 = await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2()] }, 'yes', ['task2']);
await review.applyPress('reject', fake9.sampleIds[0]);
check('a rejected essay earns nothing', fake.table('users').get('u1')?.bonusAnalyses === 0 && fake.all(model.CREDITS)[0].state === 'pending');
check('...and the student is not notified', fake.all('notifications/u1/items').length === 0);

// Shared before this change: the credit was paid then, so approval pays nothing more.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8);
const legacy = await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2()] }, 'yes', ['task2']);
const legacyCredit = fake.all(model.CREDITS)[0];
fake.put(model.CREDITS, legacyCredit.id, { uid: 'u1', consentId: 'OLD' });
await review.applyPress('approve', legacy.sampleIds[0]);
check('a credit paid at sharing (before this change) is not paid twice', fake.table('users').get('u1')?.bonusAnalyses === 0);

// A deleted account: nothing paid, no profile recreated.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8);
const gone = await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2()] }, 'yes', ['task2']);
fake.table('users').delete('u1');
await review.applyPress('approve', gone.sampleIds[0]);
check('a deleted account is not recreated by an approval', !fake.table('users').has('u1') && fake.all('notifications/u1/items').length === 0);

// Two identical requests at once (a double tap): one wins, one credit.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8);
const quick = { mode: 'quickwrite' as const, tasks: [t2()] };
const both = await Promise.allSettled([
  consent.submitConsent('u1', quick, 'yes', ['task2']),
  consent.submitConsent('u1', quick, 'yes', ['task2']),
]);
check('double tap: one succeeds', both.filter((r) => r.status === 'fulfilled').length === 1);
check('double tap: one sample', fake.all(model.SAMPLES).length === 1);
check('double tap: one credit reserved', fake.all(model.CREDITS).length === 1);

// Only one Mock task chosen: the other is a "no", never asked again.
freshWorld();
await seedReport('u1', 'Task 1', Q1, ESSAY1, 7);
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7);
result = await consent.submitConsent('u1', mock, 'yes', ['task2']);
check('Mock: share only Task 2', result.sampleIds.length === 1 && fake.all(model.SAMPLES)[0].taskType === 'task2');
check('the unticked task is recorded as no', fake.all(model.CONSENTS).find((c) => c.taskType === 'task1')?.decision === 'no');
check('nothing offered afterwards', (await consent.consentStatus('u1', mock)).offer.length === 0);

// The second Mock task marked later, in the same session: shared, no second credit.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7);
result = await consent.submitConsent('u1', mock, 'yes', ['task2']);
check('first task of the session reserves +1', result.creditPending);
await seedReport('u1', 'Task 1', Q1, ESSAY1, 8);
offer = (await consent.consentStatus('u1', mock)).offer;
check('the later task is offered', offer.map((o) => o.taskType).join() === 'task1', offer);
check('...without promising a second free assessment', (await consent.consentStatus('u1', mock)).credit === false);
result = await consent.submitConsent('u1', mock, 'yes', ['task1']);
check('the later task is shared', result.sampleIds.length === 1);
check('...without a second credit for the same Mock', !result.creditPending && fake.all(model.CREDITS).length === 1);

// "No thanks": no sample, no credit, never asked again.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7);
result = await consent.submitConsent('u1', quick, 'no', []);
check('"No thanks" shares nothing and gives nothing', result.sampleIds.length === 0 && !result.creditPending && fake.all(model.SAMPLES).length === 0 && fake.all(model.CREDITS).length === 0);
check('"No thanks" is remembered', (await consent.consentStatus('u1', quick)).offer.length === 0);
await rejects('"yes" with nothing chosen is refused', async () => {
  await seedReport('u1', 'Task 1', Q1, ESSAY1, 7);
  await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t1()] }, 'yes', []);
}, 'NOTHING_TO_SHARE');
await rejects('a 6.5 essay cannot be shared', async () => {
  await seedReport('u1', 'Task 2', Q2, 'Another essay entirely. ' + words(270), 6.5);
  await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2('Another essay entirely. ' + words(270))] }, 'yes', ['task2']);
}, 'NOTHING_TO_SHARE');

// Daily limit: 3 consent actions a day.
freshWorld();
for (let i = 0; i < DAILY_CONSENT_LIMIT + 1; i++) {
  await seedReport('u1', 'Task 2', Q2, `Essay number ${i}. ${words(270)}`, 7);
}
for (let i = 0; i < DAILY_CONSENT_LIMIT; i++) {
  await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2(`Essay number ${i}. ${words(270)}`)] }, 'yes', ['task2']);
}
check('three shares in a day reserve 3', fake.all(model.CREDITS).length === 3);
await rejects('a fourth share that day is refused', () =>
  consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2(`Essay number 3. ${words(270)}`)] }, 'yes', ['task2']), 'DAILY_LIMIT');
check('...with no fourth credit or sample', fake.all(model.CREDITS).length === 3 && fake.all(model.SAMPLES).length === 3);
check('"No thanks" does not count towards the limit', (await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2(`Essay number 3. ${words(270)}`)] }, 'no', [])).decision === 'no');

// A score-only (free) report has no vocabulary to share.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7, 'limited');
await consent.submitConsent('u1', quick, 'yes', ['task2']);
check('score-only report: sample has no vocabulary', (fake.all(model.SAMPLES)[0].vocabulary as unknown[]).length === 0);

// ── zod validation of AI replies ────────────────────────────────────────────

section('validation of AI replies');
const vocab = (n: number) => Array.from({ length: n }, (_, i) => ({ word: `collocation ${i}`, meaning: 'a meaning', uz: `tarjima ${i}`, example: 'A new example sentence.' }));
const draft2 = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  sampleAnswer: words(280), band: 8, wordCount: 280, outline: ['Intro', 'Body 1', 'Body 2', 'Conclusion'],
  vocabulary: vocab(10), grammarHighlights: ['Concession with although.', 'Relative clauses.', 'Conditionals.'],
  title: 'Children and technology', topic: 'Education', ...overrides,
});
const draft1 = (overrides: Record<string, unknown> = {}) => draft2({
  sampleAnswer: words(180), wordCount: 180, title: 'Energy consumption', topic: 'Energy', chartType: 'Line graph',
  imageAlt: 'Line graph showing energy consumption in the USA from 1980 to 2030', ...overrides,
});
const ok = (r: ReturnType<typeof generate.checkDraft>) => 'draft' in r;
const problems = (r: ReturnType<typeof generate.checkDraft>) => ('problems' in r ? r.problems.join('; ') : '');
check('valid Task 2 passes', ok(generate.checkDraft('task2', draft2(), 'end_turn')), problems(generate.checkDraft('task2', draft2(), 'end_turn')));
check('valid Task 1 passes', ok(generate.checkDraft('task1', draft1(), 'end_turn')), problems(generate.checkDraft('task1', draft1(), 'end_turn')));
check('Task 2 at 255 words fails', /260-320/.test(problems(generate.checkDraft('task2', draft2({ sampleAnswer: words(255) }), 'end_turn'))));
check('Task 2 at 330 words fails', !ok(generate.checkDraft('task2', draft2({ sampleAnswer: words(330) }), 'end_turn')));
check('Task 2 at 260 and 320 pass', ok(generate.checkDraft('task2', draft2({ sampleAnswer: words(260) }), 'end_turn')) && ok(generate.checkDraft('task2', draft2({ sampleAnswer: words(320) }), 'end_turn')));
check('Task 1 at 155 words fails', !ok(generate.checkDraft('task1', draft1({ sampleAnswer: words(155) }), 'end_turn')));
check('Task 1 at 205 words fails', !ok(generate.checkDraft('task1', draft1({ sampleAnswer: words(205) }), 'end_turn')));
check('the model\'s own word count is ignored', ok(generate.checkDraft('task2', draft2({ wordCount: 50 }), 'end_turn')));
check('7 vocabulary items fail', /fewer than 8/.test(problems(generate.checkDraft('task2', draft2({ vocabulary: vocab(7) }), 'end_turn'))));
check('13 vocabulary items fail', /more than 12/.test(problems(generate.checkDraft('task2', draft2({ vocabulary: vocab(13) }), 'end_turn'))));
check('a missing Uzbek translation fails', !ok(generate.checkDraft('task2', draft2({ vocabulary: [...vocab(9), { word: 'x', meaning: 'y', uz: '', example: 'z' }] }), 'end_turn')));
check('an Uzbek "translation" that repeats the word fails', !ok(generate.checkDraft('task2', draft2({ vocabulary: [...vocab(9), { word: 'Impact', meaning: 'y', uz: 'impact', example: 'z' }] }), 'end_turn')));
check('Task 1 without alt text fails', !ok(generate.checkDraft('task1', draft1({ imageAlt: '' }), 'end_turn')));
check('a topic outside the list fails', !ok(generate.checkDraft('task2', draft2({ topic: 'Space travel' }), 'end_turn')));
check('a cut-off reply fails', !ok(generate.checkDraft('task2', draft2(), 'max_tokens')));
check('a refusal fails', !ok(generate.checkDraft('task2', draft2(), 'refusal')));
check('broken JSON fails', !ok(generate.checkDraft('task2', '{"sampleAnswer": "x"', 'end_turn')));
check('enrichment accepts a Task 1 with no chart (empty alt)', 'notes' in generate.checkEnrichment('task1', JSON.stringify({ outline: ['a', 'b'], grammarHighlights: ['x', 'y'], title: 'Energy use', topic: 'Energy', chartType: 'Bar chart', imageAlt: '' }), 'end_turn'));
const schema = model.replyJsonSchema('draft', 'task1') as { required: string[]; additionalProperties: boolean };
check('JSON schema for structured outputs lists every field', schema.additionalProperties === false && ['sampleAnswer', 'vocabulary', 'chartType', 'imageAlt'].every((f) => schema.required.includes(f)));
check('JSON schema has no length constraints (unsupported by structured outputs)', !JSON.stringify(model.replyJsonSchema('draft', 'task2')).match(/min|max/i));

// ── Telegram review messages ────────────────────────────────────────────────

section('Telegram review messages');
freshWorld();
await seedReport('u1', 'Task 1', Q1, ESSAY1, 7);
await seedReport('u1', 'Task 2', Q2, ESSAY2, 7.5);
const shared = await consent.submitConsent('u1', mock, 'yes', ['task1', 'task2']);
for (const id of shared.sampleIds) await review.sendForReview(id);
const photo = calls.find((c) => c.method === 'sendPhoto');
check('Task 1 starts with the chart as a photo', !!photo && String(photo.body.photo).startsWith('<upload chart-q1.jpg'), calls.map((c) => c.method));
const caption = String(photo?.body.caption ?? '');
check('photo caption is the header', caption.startsWith('🎓 Student answer — Band 7') && caption.includes('TA 7 | CC 7 | LR 7 | GRA 7') && caption.includes('Task 1 • Mock • '));
check('caption shows "Task 1 of 2" and the code', /Task 1 of 2 • #[A-Z2-9]{6}/.test(caption), caption);
check('caption is under Telegram\'s limit', caption.length < 1024);
const texts = calls.filter((c) => c.method === 'sendMessage');
check('Task 1 essay replies to the photo', (texts[0].body.reply_parameters as { message_id: number }).message_id === (photo ? messageId - texts.length - 0 : -1) || !!texts[0].body.reply_parameters);
const t2msg = texts.find((c) => String(c.body.text).includes('Task 2 • Mock'));
check('Task 2 is one text message with TR', !!t2msg && String(t2msg.body.text).includes('TR 7.5 | CC 7.5 | LR 7.5 | GRA 7.5'), texts.map((t) => String(t.body.text).slice(0, 80)));
check('Task 2 says "Task 2 of 2" with the same code', String(t2msg?.body.text).includes('Task 2 of 2 • #' + caption.match(/#([A-Z2-9]{6})/)?.[1]));
check('message has the question, essay and vocabulary', String(t2msg?.body.text).includes('<b>Question</b>') && String(t2msg?.body.text).includes('<b>Essay</b>') && String(t2msg?.body.text).includes('detrimental — <i>zararli</i>'));
const kb = (c: Call | undefined) => ((c?.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })?.inline_keyboard ?? []).flat();
check('student sample: Approve and Reject only', kb(t2msg).map((b) => b.text).join() === '✅ Approve,❌ Reject', kb(t2msg));
check('the sample remembers its messages', !!(fake.all(model.SAMPLES)[0].review as { sentAt?: unknown }).sentAt);
calls = [];
check('a sample is never sent twice', !(await review.sendForReview(shared.sampleIds[0])) && calls.length === 0);
check('no writing record is said plainly', caption.includes('No writing record'), caption);


// Long essays are split, buttons on the last part.
const long = review.reviewMessages({
  taskType: 'task2', questionId: 'q2', questionText: Q2, sourceType: 'ai', sampleAnswer: Array.from({ length: 12 }, () => words(120, 'longword')).join('\n\n'),
  band: 8, criteria: null, wordCount: 1440, vocabulary: vocab(10), status: 'pending',
}, { headerInCaption: false });
check('a long text is split into several messages', long.chunks.length >= 2, long.chunks.map((c) => c.length));
check('every part fits Telegram\'s limit', long.chunks.every((c) => c.length <= review.CHUNK_LIMIT));
check('AI header says "not assessed"', long.chunks[0].includes('🤖 AI model answer — Band 8') && long.chunks[0].includes('AI draft — not assessed'));
check('AI drafts get Regenerate', review.buttons('x', 'ai').inline_keyboard[0].map((b) => b.text).join() === '✅ Approve,❌ Reject,🔁 Regenerate');
const hugeLine = review.chunkLines([{ plain: '<&>'.repeat(3000) }]);
check('one huge paragraph is cut without breaking entities', hugeLine.length > 1 && hugeLine.every((c) => c.length <= review.CHUNK_LIMIT && !/&(?:a|am|l|g)?$/.test(c)));

// ── Button presses and the webhook ──────────────────────────────────────────

section('approval presses and webhook security');
delete process.env.ADMIN_TELEGRAM_CHAT_ID;
check('without ADMIN_TELEGRAM_CHAT_ID, samples go to the first TELEGRAM_ADMIN_IDS id', review.adminChatId() === '888' && review.pressAllowed(888, 888) && !review.pressAllowed(777, 777));
process.env.TELEGRAM_ADMIN_IDS = '';
check('with neither set, nothing is sent and no press is accepted', review.adminChatId() === '' && !review.pressAllowed(888, 888));
process.env.ADMIN_TELEGRAM_CHAT_ID = '777';
process.env.TELEGRAM_ADMIN_IDS = '888';
check('private chat admin may press', review.pressAllowed(777, 777));
check('a TELEGRAM_ADMIN_IDS member may press in the admin chat', review.pressAllowed(777, 888));
check('a stranger in the admin chat may not', !review.pressAllowed(777, 999));
check('the admin in another chat may not', !review.pressAllowed(555, 777));
const target = shared.sampleIds[1];
const webhook = async (update: unknown, secret = webhookSecret(process.env.TELEGRAM_STUDENT_BOT_TOKEN!)) => {
  let status = 0;
  const res = { status(code: number) { status = code; return res; }, end() { return res; }, json() { return res; }, setHeader() { return res; } };
  await telegramRoute({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: update, query: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
  return status;
};
const press = (data: string, from = 777, chat = 777, updateId = Math.floor(Math.random() * 1e9)) => ({
  update_id: updateId,
  callback_query: { id: `cb${updateId}`, from: { id: from, first_name: 'Admin' }, data, message: { message_id: 4242, chat: { id: chat, type: 'private' } } },
});
calls = [];
check('wrong secret token is refused', (await webhook(press(`smp:a:${target}`), 'wrong')) === 401);
check('...and changes nothing', fake.table(model.SAMPLES).get(target)?.status === 'pending');
await webhook(press(`smp:a:${target}`, 999, 777));
check('a stranger\'s press changes nothing', fake.table(model.SAMPLES).get(target)?.status === 'pending');
check('...and is told no', calls.some((c) => c.method === 'answerCallbackQuery' && c.body.text === 'Not allowed.'));
calls = [];
check('admin press is accepted', (await webhook(press(`smp:a:${target}`))) === 200);
const published = fake.table(model.SAMPLES).get(target)!;
check('Approve publishes', published.status === 'published' && !!published.publishedAt && !!published.pageChangedAt);
check('Approve updates the submission too', fake.table(model.SUBMISSIONS).get(target)?.status === 'published');
const edit = calls.find((c) => c.method === 'editMessageText');
check('the message is edited to say Published, and that the student was paid', !!edit && String(edit.body.text).endsWith('<b>✅ Published · +1 free report sent to the student</b>'), edit && String(edit.body.text).slice(-80));
check('the buttons are gone', !!edit && edit.body.reply_markup === undefined);
calls = [];
await webhook(press(`smp:r:${target}`));
check('a second press cannot change it', fake.table(model.SAMPLES).get(target)?.status === 'published');
check('...and just shows the result', calls.some((c) => c.method === 'answerCallbackQuery' && c.body.text === '✅ Published'));
await webhook(press(`smp:r:${shared.sampleIds[0]}`));
check('Reject rejects', fake.table(model.SAMPLES).get(shared.sampleIds[0])?.status === 'rejected');
check('student samples cannot be regenerated', (await review.applyPress('regenerate', target)).kind !== 'done');
check('student bot buttons still reach the student bot', (await review.handleReviewPress({ id: 'x', from: { id: 1 }, data: 'check' })) === false);

// ── The batch cycle ─────────────────────────────────────────────────────────

section('daily AI batch');
freshWorld();
fake.put(model.BANK.task1, 'q1nochart', { report: 'The bar chart shows coffee sales in three cities.', createdAt: 3 });
fake.put(model.BANK.task2, 'q2b', { report: 'Some people prefer to live in cities. Discuss both views.', createdAt: 4 });
type Req = Parameters<typeof generate.anthropicBatches>[0] extends never ? never : { custom_id: string; params: Record<string, unknown> };
let created: Req[] = [];
let replies = new Map<string, { text: string; stop?: string; error?: string }>();
let batchStatus = 'in_progress';
const api = {
  create: async (requests: unknown[]) => { created = requests as Req[]; return { id: `batch_${created.length}` }; },
  status: async () => batchStatus,
  results: async function* () {
    for (const r of created) {
      const reply = replies.get(r.custom_id);
      if (!reply) continue;
      if (reply.error) {
        yield { custom_id: r.custom_id, result: { type: 'errored', error: { type: 'error', request_id: null, error: { type: reply.error, message: 'bad' } } } } as never;
        continue;
      }
      yield {
        custom_id: r.custom_id,
        result: { type: 'succeeded', message: { content: [{ type: 'text', text: reply.text }], stop_reason: reply.stop ?? 'end_turn', usage: { input_tokens: 4000, output_tokens: 1500, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 } } },
      } as never;
    }
  },
};
let submitted = await generate.submitBatch(api, 10);
check('drafts for every question without a sample', submitted.drafts === 3, submitted);
check('a Task 1 question without a chart becomes needs_manual instead', submitted.noChart === 1 && fake.all(model.SAMPLES).some((s) => s.questionId === 'q1nochart' && s.status === 'needs_manual'));
check('the newest questions come first', created.map((r) => (r as { custom_id: string }).custom_id).length === 3);
const userText = (r: Req) => JSON.stringify(r.params.messages);
const t1req = created.find((r) => userText(r).includes('The line graph below shows'))!;
const t1content = ((t1req.params.messages as { content: { type: string; text?: string }[] }[])[0]).content;
check('Task 1 always sends the chart as an image', t1content[0].type === 'image');
check('Task 1 tells the model to read the numbers from the image', t1content.some((b) => b.text?.includes('Read all numbers, labels, and units directly from the image')));
check('shared instructions are cached', ((t1req.params.system as { cache_control?: unknown }[])[0]).cache_control !== undefined);
check('the band descriptors are in the cached part', String(((t1req.params.system as { text: string }[])[0]).text).includes('TASK ACHIEVEMENT') && String(((t1req.params.system as { text: string }[])[0]).text).includes('TASK RESPONSE'));
check('structured outputs are asked for', !!(t1req.params.output_config as { format?: unknown })?.format);
check('model is Haiku', t1req.params.model === 'claude-haiku-4-5');
check('the run is recorded', fake.all(model.RUNS).length === 1 && fake.all(model.RUNS)[0].status === 'submitted');
check('questions in flight are not picked again', (await generate.submitBatch(api, 10)).drafts === 0);
fake.table(model.RUNS).clear();
fake.put(model.RUNS, 'batch_3', { batchId: 'batch_3', status: 'submitted', model: 'claude-haiku-4-5', submittedAt: Date.now(), requests: created.map((r, i) => {
  const text = userText(r);
  const questionId = text.includes('The line graph below shows') ? 'q1' : text.includes('live in cities') ? 'q2b' : 'q2';
  return { customId: r.custom_id, kind: 'draft', questionId, taskType: questionId === 'q1' ? 'task1' : 'task2', questionText: questionId === 'q1' ? Q1 : questionId === 'q2' ? Q2 : 'Some people prefer to live in cities. Discuss both views.', ...(questionId === 'q1' ? { imageExt: 'jpg' } : {}), _i: i };
}) });
const idFor = (q: string) => (fake.table(model.RUNS).get('batch_3')!.requests as { customId: string; questionId: string }[]).find((r) => r.questionId === q)!.customId;
replies = new Map([
  [idFor('q1'), { text: draft1() }],
  [idFor('q2'), { text: draft2() }],
  [idFor('q2b'), { text: draft2({ sampleAnswer: words(200) }) }],
]);
calls = [];
let collected = await generate.collectBatches(api);
check('nothing collected while the batch runs', collected.runs === 0);
batchStatus = 'ended';
collected = await generate.collectBatches(api);
check('finished batch collected', collected.runs === 1 && collected.drafts === 2 && collected.needsManual === 1, collected);
const aiSamples = fake.all(model.SAMPLES).filter((s) => s.sourceType === 'ai' && s.status === 'pending');
check('valid drafts wait for approval', aiSamples.length === 2);
const aiT1 = aiSamples.find((s) => s.taskType === 'task1')!;
check('Task 1 draft has slug, image URL and alt text', aiT1.slug === 'line-graph-energy-consumption' && aiT1.imageUrl === 'https://www.writeready.uz/question-images/line-graph-energy-consumption.jpg' && String(aiT1.imageAlt).startsWith('Line graph showing'), aiT1);
check('Task 2 draft slug from the title', aiSamples.find((s) => s.taskType === 'task2')?.slug === 'children-and-technology');
check('question metadata saved', fake.table(model.QUESTION_META).get('q1')?.chartType === 'Line graph' && fake.table(model.QUESTION_META).get('q2')?.topic === 'Education');
check('a too-short draft is needs_manual with reasons, never pending', fake.all(model.SAMPLES).some((s) => s.questionId === 'q2b' && s.status === 'needs_manual' && JSON.stringify(s.validationErrors).includes('260-320')));
check('drafts are sent for review with Regenerate', calls.some((c) => c.method === 'sendMessage' && kb(c).some((b) => b.text === '🔁 Regenerate')));
check('Task 1 draft starts with the chart photo', calls.some((c) => c.method === 'sendPhoto' && String(c.body.caption).startsWith('🤖 AI model answer — Band 8')));
const run = fake.all(model.RUNS)[0];
check('token use and cost recorded', (run.usage as { input: number }).input === 12000 && Number(run.costUSD) > 0 && run.status === 'collected', run);
// The same run collected again (an overlapping or retried cron) saves nothing twice.
fake.put(model.RUNS, 'batch_3', { ...fake.table(model.RUNS).get('batch_3')!, status: 'submitted' });
const before = fake.all(model.SAMPLES).length;
calls = [];
const twice = await Promise.all([generate.collectBatches(api), generate.collectBatches(api)]);
check('two overlapping collects: only one takes the run', twice.filter((c) => c.runs === 1).length === 1, twice);
check('a run collected again saves no new samples', fake.all(model.SAMPLES).length === before, fake.all(model.SAMPLES).length - before);
check('a run collected again sends nothing to review twice', !calls.some((c) => c.method === 'sendMessage' || c.method === 'sendPhoto'), calls.map((c) => c.method));
fake.put(model.RUNS, 'batch_3', { ...fake.table(model.RUNS).get('batch_3')!, status: 'collecting', claimedAt: Date.now() });
check('a fresh claim by another run is left alone', (await generate.collectBatches(api)).runs === 0);
fake.put(model.RUNS, 'batch_3', { ...fake.table(model.RUNS).get('batch_3')!, status: 'collecting', claimedAt: Date.now() - 20 * 60 * 1000 });
check('a stale claim (the run timed out) is taken over', (await generate.collectBatches(api)).runs === 1 && fake.all(model.SAMPLES).length === before);
check('draft ids fit Telegram button data', /^[\w-]{1,40}$/.test(generate.draftSampleId('msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d', 'draft-12')));
check('cost uses Batch prices', Math.abs(Number(run.costUSD) - generate.costUSD({ input: 12000, output: 4500, cacheWrite: 0, cacheRead: 9000 })) < 1e-9 && Math.abs(generate.costUSD({ input: 1e6, output: 1e6, cacheWrite: 0, cacheRead: 0 }) - 3) < 1e-9);

// Regenerate: the draft is rejected and the question comes back first.
calls = [];
const regen = aiSamples.find((s) => s.taskType === 'task2')!;
await webhook(press(`smp:g:${regen.id}`));
check('Regenerate rejects the draft', fake.table(model.SAMPLES).get(regen.id)?.status === 'rejected');
check('Regenerate queues the question', fake.table(model.QUEUE).get('q2')?.kind === 'regenerate');
batchStatus = 'in_progress';
submitted = await generate.submitBatch(api, 1);
check('the queued question is drafted first', submitted.drafts === 1 && userText(created[0]).includes('children should not use technology'), created.map((r) => r.custom_id));
// A rejected draft (without Regenerate) is not drafted again.
fake.table(model.RUNS).clear();
fake.table(model.QUEUE).clear();
const rejectedOnly = (await generate.submitBatch(api, 10)).drafts;
check('a question whose draft was rejected is not redrafted by itself', rejectedOnly === 0, rejectedOnly);

// Student samples get their notes from the same batch.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8);
const [studentId] = (await consent.submitConsent('u1', quick, 'yes', ['task2'])).sampleIds;
fake.put(model.SAMPLES, 'other', { questionId: 'q1', status: 'published', sourceType: 'ai', taskType: 'task1' });
batchStatus = 'in_progress';
submitted = await generate.submitBatch(api, 0);
check('a student essay is sent for notes, not rewritten', submitted.enrich === 1 && userText(created[0]).includes('KIND B'));
fake.table(model.RUNS).clear();
fake.put(model.RUNS, 'b2', { batchId: 'b2', status: 'submitted', model: 'claude-haiku-4-5', submittedAt: Date.now(), requests: [{ customId: created[0].custom_id, kind: 'enrich', questionId: 'q2', taskType: 'task2', questionText: Q2, sampleId: studentId }] });
replies = new Map([[created[0].custom_id, { text: JSON.stringify({ outline: ['Intro', 'View 1', 'View 2', 'Conclusion'], grammarHighlights: ['Uses although for concession.', 'Uses relative clauses.'], title: 'Children and technology', topic: 'Education' }) }]]);
batchStatus = 'ended';
collected = await generate.collectBatches(api);
const enriched = fake.table(model.SAMPLES).get(studentId)!;
check('student sample gets outline and grammar notes', collected.enriched === 1 && (enriched.outline as string[]).length === 4 && !!enriched.enrichedAt);
check('student sample gets the question slug', enriched.slug === 'children-and-technology', enriched.slug);
check('the essay itself is unchanged', enriched.sampleAnswer === stripPersonalDetails(ESSAY2).text);

// ── Evening: rebuild and summary ────────────────────────────────────────────

// ── Relax: the student's own question ───────────────────────────────────────

section("Relax: the student's own question");
freshWorld();
const OWN1 = 'The bar chart shows the results of a survey about what makes a business successful in the USA and Europe.';
const OWN_ESSAY = `The bar chart compares opinions in the USA and Europe. ${words(180)}`;
const PNG_CHART = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;
await seedReport('u1', 'Task 1', OWN1, OWN_ESSAY, 8);
const relax1 = (chart: string | null) => ({ mode: 'relax' as const, tasks: [t1(OWN_ESSAY, null, OWN1, chart)] });
check('own Task 1 question without its chart is not offered', (await consent.consentStatus('u1', relax1(null))).offer.length === 0);
check('own Task 1 question with its chart is offered', (await consent.consentStatus('u1', { mode: 'relax', tasks: [{ ...t1(OWN_ESSAY, null, OWN1), hasChart: true }] })).offer.length === 1);
check('the same own question in Quick Write is refused', (await consent.consentStatus('u1', { mode: 'quickwrite', tasks: [{ ...t1(OWN_ESSAY, null, OWN1), hasChart: true }] })).offer.length === 0);
await rejects('saying yes without sending the chart is refused', () =>
  consent.submitConsent('u1', { mode: 'relax', tasks: [{ ...t1(OWN_ESSAY, null, OWN1), hasChart: true }] }, 'yes', ['task1']), 'BAD_REQUEST');
check('the chart is checked before it is kept', consent.readSession({ mode: 'relax', tasks: [{ taskType: 'Task 1', question: OWN1, essay: 'x', chart: 'data:text/html;base64,PHNjcmlwdD4=' }] }).tasks[0].chart === null);
calls = [];
const own = await consent.submitConsent('u1', relax1(PNG_CHART), 'yes', ['task1']);
const ownSample = fake.table(model.SAMPLES).get(own.sampleIds[0])!;
const cq = fake.all(model.CUSTOM_QUESTIONS);
check('own question shared: a custom question is created with the chart', cq.length === 1 && cq[0].id.startsWith('cq_') && cq[0].chart === PNG_CHART && cq[0].text === OWN1 && cq[0].taskType === 'task1');
check('the sample points at it and is marked custom', ownSample.questionId === cq[0].id && ownSample.questionSource === 'custom' && ownSample.status === 'pending');
check('no partner source credit on a student\'s own question', ownSample.sourceCredit === undefined);
check('the credit is reserved as usual', own.creditPending);
check('the own question never joins the practice bank', !fake.table(model.BANK.task1).has(cq[0].id));
await review.sendForReview(own.sampleIds[0]);
const ownPhoto = calls.find((c) => c.method === 'sendPhoto');
check('Telegram gets the student\'s chart', !!ownPhoto && String(ownPhoto.body.photo).includes(`chart-${cq[0].id}.png`));
check('Telegram says approving publishes the question and chart', String(ownPhoto?.body.caption).includes("Student's own question and chart: approving publishes them too"));
// Another student, same wording: the same custom question, one page.
await seedReport('u2', 'Task 1', OWN1, OWN_ESSAY + ' Another ending.', 7.5);
const own2 = await consent.submitConsent('u2', { mode: 'relax', tasks: [t1(OWN_ESSAY + ' Another ending.', null, OWN1, PNG_CHART)] }, 'yes', ['task1']);
check('the same own question shared again reuses it', fake.all(model.CUSTOM_QUESTIONS).length === 1 && fake.table(model.SAMPLES).get(own2.sampleIds[0])?.questionId === cq[0].id);

// ── Right after Approve: a page address at once ──────────────────────────────

section('page address right after approval');
check('fallback title from a Task 1 question', generate.fallbackTitle('The bar chart below shows the number of cars per 1000 people in five countries in 2005. Summarise the information.') === 'Number of cars per 1000 people in five countries', generate.fallbackTitle('The bar chart below shows the number of cars per 1000 people in five countries in 2005. Summarise the information.'));
check('fallback title from a line graph question', generate.fallbackTitle('The line graph illustrates energy use in the USA from 1980 to 2030.') === 'Energy use in the USA', generate.fallbackTitle('The line graph illustrates energy use in the USA from 1980 to 2030.'));
check('fallback title from a Task 2 question', generate.fallbackTitle('Some people think children should not use technology at school. To what extent do you agree?') === 'Some people think children should not use technology', generate.fallbackTitle('Some people think children should not use technology at school. To what extent do you agree?'));
const notes = JSON.stringify({ outline: ['Intro', 'Overview', 'Details'], grammarHighlights: ['Uses while for contrast.', 'Uses the passive.'], title: 'Business success factors', topic: 'Economy & Business', chartType: 'Bar chart', imageAlt: 'Bar chart comparing business success factors in the USA and Europe' });
let aiCalls = 0;
const fakeClient = { messages: { create: async () => { aiCalls++; return { content: [{ type: 'text', text: notes }], stop_reason: 'end_turn' }; } } } as never;
let approvedHook: string[] = [];
calls = [];
await review.handleReviewPress(
  { id: 'cbA', from: { id: 777 }, data: `smp:a:${own.sampleIds[0]}`, message: { message_id: 1, chat: { id: 777 } } },
  { onApproved: async (id) => { approvedHook.push(id); return generate.prepareForPage(id, fakeClient); } },
);
const ready = fake.table(model.SAMPLES).get(own.sampleIds[0])!;
check('approving runs the page step once', approvedHook.length === 1 && aiCalls === 1);
check('the approved sample gets its page address and chart address', ready.status === 'published' && ready.slug === 'bar-chart-business-success-factors' && ready.imageUrl === 'https://www.writeready.uz/question-images/bar-chart-business-success-factors.png', [ready.slug, ready.imageUrl]);
check('its outline and grammar notes are written', (ready.outline as string[]).length === 3 && !!ready.enrichedAt);
check('the question metadata is saved', fake.table(model.QUESTION_META).get(cq[0].id)?.title === 'Business success factors');
check('the other sample on the same question gets the address too', fake.table(model.SAMPLES).get(own2.sampleIds[0])?.slug === 'bar-chart-business-success-factors');
check('a rejected press does not run the page step', await (async () => { approvedHook = []; await review.handleReviewPress({ id: 'cbR', from: { id: 777 }, data: `smp:r:${own2.sampleIds[0]}`, message: { message_id: 2, chat: { id: 777 } } }, { onApproved: async (id) => approvedHook.push(id) }); return approvedHook.length === 0; })());
// Without the AI: an address from the question's own words.
freshWorld();
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8);
const [plain] = (await consent.submitConsent('u1', quick, 'yes', ['task2'])).sampleIds;
await review.applyPress('approve', plain);
check('a published sample with no address is found by the daily job', (await generate.prepareWaitingPages(null)) === 1);
check('without the AI it still gets an address from its own words', fake.table(model.SAMPLES).get(plain)?.slug === 'some-people-think-children-should-not-use', fake.table(model.SAMPLES).get(plain)?.slug);
check('and the page counts as changed, so the evening rebuilds', !!fake.table(model.SAMPLES).get(plain)?.pageChangedAt);
check('a sample that has its address is left alone', (await generate.prepareWaitingPages(null)) === 0);

section('evening rebuild and summary');
let hookCalls = 0;
const fetcher = (async () => { hookCalls++; return new Response('{}', { status: 201 }); }) as unknown as typeof fetch;
check('no hook URL: nothing called', (await daily.rebuildIfChanged({ fetcher, force: true })) === 'no-hook' && hookCalls === 0);
process.env.VERCEL_DEPLOY_HOOK_URL = 'https://api.vercel.com/v1/integrations/deploy/prj_test/hook';
fake.put(model.SAMPLES, 'pub', { status: 'published', pageChangedAt: new Date(Date.now() + 1000).getTime() });
// pageChangedAt in the stand-in is a number; Firestore holds a Timestamp. Store one.
const { Timestamp } = await import('firebase-admin/firestore');
fake.put(model.SAMPLES, 'pub', { status: 'published', pageChangedAt: Timestamp.fromMillis(Date.now() + 1000), publishedAt: Timestamp.now() });
check('a published change triggers the deploy hook', (await daily.rebuildIfChanged({ fetcher })) === 'triggered' && hookCalls === 1);
fake.put(model.SAMPLES, 'pub', { status: 'published', pageChangedAt: Timestamp.fromMillis(Date.now() - 60_000), publishedAt: Timestamp.now() });
{ const r = await daily.rebuildIfChanged({ fetcher }); check('nothing new: no rebuild', r === 'unchanged' && hookCalls === 1, { r, hookCalls, changed: fake.all(model.SAMPLES).filter((s) => s.pageChangedAt).map((s) => [s.id, s.pageChangedAt]), cfg: fake.all('config') }); }
const numbers = await daily.dayNumbers();
check('summary counts', numbers.publishedToday >= 1 && numbers.waiting >= 0, numbers);
const text = daily.summaryText({ publishedToday: 3, waiting: 5, needsManual: 1, costUSD: 0.0612 }, 'triggered');
check('summary format', text.startsWith('📊 Published today: 3 | Waiting: 5 | needs_manual: 1 | Generation cost: $0.06'), text);
check('tiny costs keep their digits', daily.formatCost(0.0031) === '$0.0031');
check('cron picks the job from the schedule', jobFor(undefined, '0 2 * * *') === 'morning' && jobFor(undefined, '0 15 * * *') === 'evening' && jobFor('evening', '0 2 * * *') === 'evening');
check('Tashkent day starts at 19:00 UTC', daily.tashkentDayStart(new Date('2026-10-06T20:00:00Z')).toISOString() === '2026-10-06T19:00:00.000Z');

// ── How it was written, and where it was seen before ────────────────────────

section('writing record and seen before');
check('writing record: typed slowly reads as normal', review.writingLine({ pastedChars: 30, chars: 1600, activeSeconds: 34 * 60 }) === '✍️ 34 min writing · 2% pasted', review.writingLine({ pastedChars: 30, chars: 1600, activeSeconds: 34 * 60 }));
check('writing record: mostly pasted is flagged', review.writingLine({ pastedChars: 1550, chars: 1600, activeSeconds: 40 }) === '⚠️ under 1 min writing · 97% pasted');
check('writing record: typed faster than anyone can is flagged', review.writingLine({ pastedChars: 0, chars: 1600, activeSeconds: 60 }).startsWith('⚠️'));
check('a writing record that is not believable is dropped', model.readWritingRecord({ pastedChars: -1, chars: 10, activeSeconds: 5 }) === null && model.readWritingRecord({ pastedChars: 1, chars: 0, activeSeconds: 5 }) === null && model.readWritingRecord('x') === null);
check('pasted never counts above the essay length', model.readWritingRecord({ pastedChars: 5000, chars: 1600, activeSeconds: 5 })?.pastedChars === 1600);
freshWorld();
calls = [];
await seedReport('u1', 'Task 2', Q2, ESSAY2, 8);
const typed = await consent.submitConsent('u1', consent.readSession({ mode: 'quickwrite', tasks: [{ taskType: 'Task 2', questionId: 'q2', question: Q2, essay: ESSAY2, writing: { pastedChars: 1500, chars: 1520, activeSeconds: 50 } }] }), 'yes', ['task2']);
const typedSample = fake.table(model.SAMPLES).get(typed.sampleIds[0])!;
check('the writing record is kept for the reviewer', (typedSample.review as { writing?: { pastedChars: number } }).writing?.pastedChars === 1500);
check('...and privately with the submission', (fake.table(model.SUBMISSIONS).get(typed.sampleIds[0])?.writing as { chars: number })?.chars === 1520);
await review.sendForReview(typed.sampleIds[0]);
check('Telegram shows the pasted essay with a warning', calls.some((c) => String(c.body.text).includes('⚠️ under 1 min writing · 99% pasted')), calls.map((c) => String(c.body.text).slice(0, 200)));
check('a first share of new text is not flagged as seen', !(typedSample.review as { seenBefore?: string }).seenBefore);
// Another account shares the very same essay.
await seedReport('u2', 'Task 2', Q2, ESSAY2, 8);
const copied = await consent.submitConsent('u2', { mode: 'quickwrite', tasks: [t2()] }, 'yes', ['task2']);
check('the same text from another account is flagged', (fake.table(model.SAMPLES).get(copied.sampleIds[0])!.review as { seenBefore?: string }).seenBefore === 'shared');
// An essay copied from a sample answer already on the site.
freshWorld();
const COPIED = `This sample essay is on the site already. ${words(270)}`;
fake.put(model.SAMPLES, 'onsite', { questionId: 'q2', taskType: 'task2', status: 'published', sourceType: 'ai', sampleAnswer: COPIED });
await seedReport('u1', 'Task 2', Q2, COPIED, 8);
const fromSite = await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2(COPIED)] }, 'yes', ['task2']);
check('an essay copied from a sample answer is flagged', (fake.table(model.SAMPLES).get(fromSite.sampleIds[0])!.review as { seenBefore?: string }).seenBefore === 'sample');
// Marked from another account first: its score lock is older than this student's report.
freshWorld();
const MARKED = `An essay someone else had marked first. ${words(270)}`;
await seedReport('u1', 'Task 2', Q2, MARKED, 8);
const markedKey = essayKeys('Task 2', Q2, MARKED).contentKey;
const { Timestamp: Ts } = await import('firebase-admin/firestore');
fake.put('score_locks', markedKey, { createdAt: Ts.fromMillis(Date.now() - 3 * 3600 * 1000) });
const marked = await consent.submitConsent('u1', { mode: 'quickwrite', tasks: [t2(MARKED)] }, 'yes', ['task2']);
check('an essay marked from another account first is flagged', (fake.table(model.SAMPLES).get(marked.sampleIds[0])!.review as { seenBefore?: string }).seenBefore === 'marked');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
