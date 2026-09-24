/**
 * Checks the database side of "same essay, same score" and score-card
 * verification, against an in-memory stand-in for Firestore.
 *
 *   npx tsx scripts/test-score-store.ts
 *
 * Local development shares the live database with the real site, so this
 * never connects to Firestore at all: api/_lib/db.ts is pointed at the
 * stand-in below. No network, no AI, a throwaway secret.
 */

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

process.env.NONCE_SECRET = 'test-secret-for-offline-checks-only';

const { setTestFirestore } = await import('../api/_lib/db.js');
const store = await import('../api/_lib/savedReports.js');
const verification = await import('../api/_lib/verification.js');
const { normalizeScores } = await import('../api/_lib/bandScore.js');

// ── A small stand-in for the parts of Firestore this code uses ─────────────

type Data = Record<string, unknown>;
const collections = new Map<string, Map<string, Data>>();
const table = (name: string) => {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
};
let autoId = 0;

function resolve(data: Data): Data {
  // A server timestamp becomes "now", as Firestore would write it.
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof FieldValue ? Timestamp.now() : v]));
}

function snapshot(name: string, id: string) {
  const data = table(name).get(id);
  return {
    id,
    exists: data !== undefined,
    data: () => (data ? structuredClone(data) : undefined),
    get: (field: string) => data?.[field],
  };
}

function docRef(name: string, id: string) {
  return {
    id,
    get: async () => snapshot(name, id),
    set: async (data: Data, options?: { merge?: boolean }) => {
      const before = options?.merge ? table(name).get(id) ?? {} : {};
      table(name).set(id, { ...before, ...resolve(data) });
    },
  };
}

function query(name: string, filters: [string, unknown][], max = Infinity) {
  return {
    where: (field: string, op: string, value: unknown) => {
      if (op !== '==') throw new Error(`stand-in only supports ==, not ${op}`);
      return query(name, [...filters, [field, value]], max);
    },
    limit: (n: number) => query(name, filters, n),
    get: async () => ({
      docs: [...table(name).entries()]
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .slice(0, max)
        .map(([id]) => snapshot(name, id)),
    }),
  };
}

const fake = {
  collection: (name: string) => ({
    ...query(name, []),
    doc: (id?: string) => docRef(name, id ?? `auto${String(++autoId).padStart(16, '0')}`),
  }),
  getAll: async (...refs: { id: string; get: () => Promise<unknown> }[]) => Promise.all(refs.map((r) => r.get())),
};
setTestFirestore(fake as unknown as Firestore);

// ── Checks ──────────────────────────────────────────────────────────────────

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}
async function throwsCode(fn: () => Promise<unknown>, code: string) {
  try { await fn(); return false; } catch (e) { return (e as { code?: string }).code === code; }
}

const QUESTION = 'Some people believe that university education should be free for everyone. To what extent do you agree or disagree?';
const ESSAY = Array.from({ length: 6 }, (_, i) =>
  `Paragraph ${i} argues that free university education widens access for talented students from poor families, strengthens the economy and repays its cost through higher taxes later in life.`).join(' ');
const scores = (b: number) => normalizeScores({ taskAchievement: b, coherenceCohesion: b, lexicalResource: b, grammaticalRangeAccuracy: b })!;

console.log('\nSaved reports');
const keys = store.essayKeys('Task 2', QUESTION, ESSAY);
const report = (tier: 'full' | 'limited', band: number, reportId: string) => ({
  tier, raw: JSON.stringify({ scores: scores(band) }), scores: scores(band), topic: 'Education', reportId,
  signature: store.essaySignature(ESSAY), signatureVersion: store.SIGNATURE_VERSION,
});
await store.saveSavedReport('u1', keys, 'Task 2', report('limited', 6.5, 'rep1'));
const loaded = await store.loadSavedReport('u1', keys.contentKey);
check('a saved report reopens', loaded?.reportId === 'rep1' && loaded.tier === 'limited' && loaded.scores.overall === 6.5);
check('another student cannot open it', (await store.loadSavedReport('u2', keys.contentKey)) === null);
const savedDoc = table('saved_reports').get(`u1_${keys.contentKey}`)!;
check('the stored copy is sealed, not readable', typeof savedDoc.sealed === 'string' && !(savedDoc.sealed as string).includes('Education'));
const firstCreated = savedDoc.createdAt;
await store.saveSavedReport('u1', keys, 'Task 2', report('full', 6.5, 'rep1'));
const upgraded = await store.loadSavedReport('u1', keys.contentKey);
check('upgrading to the full report keeps the entry and its bands', upgraded?.tier === 'full' && upgraded.scores.overall === 6.5);
check('and keeps when it was first saved', table('saved_reports').get(`u1_${keys.contentKey}`)!.createdAt === firstCreated);
const sealedParts = (savedDoc.sealed as string).split('.');
sealedParts[3] = sealedParts[3].slice(0, 4) + (sealedParts[3][4] === 'A' ? 'B' : 'A') + sealedParts[3].slice(5);
table('saved_reports').set(`u1_${keys.contentKey}`, { ...savedDoc, sealed: sealedParts.join('.') });
check('a tampered copy reads as missing', (await store.loadSavedReport('u1', keys.contentKey)) === null);
table('saved_reports').set(`u1_${keys.contentKey}`, { ...savedDoc, uid: 'u2' });
check('editing the plain fields does not move it to another student', (await store.loadSavedReport('u2', keys.contentKey)) === null);
table('saved_reports').set(`u1_${keys.contentKey}`, savedDoc);

console.log('\nNearly the same essay');
const v2 = ESSAY.replace('talented', 'gifted');
const keys2 = store.essayKeys('Task 2', QUESTION, v2);
const similar = await store.findSimilarReport('u1', keys2, store.essaySignature(v2));
check('a one-word edit finds the earlier version and its bands', similar?.scores.overall === 6.5, JSON.stringify(similar));
check('the exact same essay is not its own "earlier version"',
  (await store.findSimilarReport('u1', keys, store.essaySignature(ESSAY))) === null);
check("another student's essay is never used", (await store.findSimilarReport('u2', keys2, store.essaySignature(v2))) === null);
const otherQ = store.essayKeys('Task 2', `${QUESTION} Discuss.`, v2);
check('an essay for another question is never used', (await store.findSimilarReport('u1', otherQ, store.essaySignature(v2))) === null);
const rewritten = `${ESSAY.slice(0, 200)} ${'Completely new argument about student debt and the labour market. '.repeat(8)}`;
check('a heavy rewrite is marked afresh',
  (await store.findSimilarReport('u1', store.essayKeys('Task 2', QUESTION, rewritten), store.essaySignature(rewritten))) === null);

console.log('\nScore locks');
await store.saveScoreLock(keys.contentKey, 'Task 2', { scores: scores(7), topic: 'Education' });
check('a lock reads back', (await store.loadScoreLock(keys.contentKey))?.scores.overall === 7);
check('no lock for an unmarked text', (await store.loadScoreLock(keys2.contentKey)) === null);
const lockDoc = table('score_locks').get(keys.contentKey)!;
table('score_locks').set(keys.contentKey, { ...lockDoc, scores: scores(9) });
check('a lock with forged bands is ignored', (await store.loadScoreLock(keys.contentKey)) === null);
table('score_locks').set(keys.contentKey, { ...lockDoc, version: '2020-01-01' });
check('a lock from an older scoring version is ignored', (await store.loadScoreLock(keys.contentKey)) === null);
table('score_locks').set(keys.contentKey, lockDoc);

console.log('\nVerification');
const history = (id: string, uid: string, taskType: 'Task 1' | 'Task 2', band: number, signed = true) =>
  table('feedback_reports').set(id, {
    uid, taskType, scores: scores(band), createdAt: Timestamp.fromDate(new Date('2026-09-24T09:00:00Z')),
    ...(signed ? { sig: store.reportSignature(id, uid, taskType, scores(band)) } : {}),
  });
history('reportT2aaaaaaaaaaaa', 'u1', 'Task 2', 7);
history('reportT1aaaaaaaaaaaa', 'u1', 'Task 1', 6.5);
history('reportOldaaaaaaaaaaa', 'u1', 'Task 2', 8, false);
history('reportU2aaaaaaaaaaaa', 'u2', 'Task 2', 9);

const single = await verification.buildVerification('u1', ['reportT2aaaaaaaaaaaa'], '  Kamola  Yusupova ');
check('a task card verifies, with the name tidied', single.kind === 'task' && single.name === 'Kamola Yusupova' && single.tasks[0].scores.overall === 7);
check('previewing saves nothing', table('score_verifications').size === 0);
check("someone else's report is refused", await throwsCode(() => verification.buildVerification('u2', ['reportT2aaaaaaaaaaaa'], 'x'), 'NOT_OWNER'));
check('a report made before signing existed is refused', await throwsCode(() => verification.buildVerification('u1', ['reportOldaaaaaaaaaaa'], 'x'), 'UNSIGNED'));
check('a missing report is refused', await throwsCode(() => verification.buildVerification('u1', ['reportNoneaaaaaaaaaa'], 'x'), 'NOT_FOUND'));
check('bad input is refused', await throwsCode(() => verification.buildVerification('u1', ['../x'], 'x'), 'BAD_INPUT'));
history('reportT2bbbbbbbbbbbb', 'u1', 'Task 2', 6);
check('two Task 2 reports are not a full test',
  await throwsCode(() => verification.buildVerification('u1', ['reportT2aaaaaaaaaaaa', 'reportT2bbbbbbbbbbbb'], 'x'), 'MISMATCH'));
const fullTest = await verification.buildVerification('u1', ['reportT2aaaaaaaaaaaa', 'reportT1aaaaaaaaaaaa'], 'Kamola');
check('a full test verifies, Task 1 first, with its Writing band',
  fullTest.kind === 'full' && fullTest.tasks[0].taskType === 'Task 1' && fullTest.writing?.band === 7, JSON.stringify(fullTest.writing));
check('report order does not change the code',
  (await verification.buildVerification('u1', ['reportT1aaaaaaaaaaaa', 'reportT2aaaaaaaaaaaa'], 'Kamola')).code === fullTest.code);

await verification.activateVerification(single);
const read = await verification.readVerification(single.code);
check('an activated code opens as valid', read.status === 'valid' && read.verification.name === 'Kamola Yusupova');
check('the public record keeps the band', read.status === 'valid' && read.verification.tasks[0].scores.overall === 7);
check('it is listed for its owner', (await verification.listVerifications('u1')).some((i) => i.verification.code === single.code));
check('and not for anyone else', (await verification.listVerifications('u2')).length === 0);
check('only its owner can withdraw it', !(await verification.revokeVerification('u2', single.code)));
check('its owner can', await verification.revokeVerification('u1', single.code));
check('a withdrawn code says so', (await verification.readVerification(single.code)).status === 'revoked');
check('a withdrawn code leaves the list', !(await verification.listVerifications('u1')).some((i) => i.verification.code === single.code));
await verification.activateVerification(single);
check('downloading the card again brings it back', (await verification.readVerification(single.code)).status === 'valid');

const forged = table('score_verifications').get(single.code)!;
table('score_verifications').set('ZZZZZZZZ', { ...forged, code: 'ZZZZZZZZ' });
check('a copied record under another code is not valid', (await verification.readVerification('ZZZZZZZZ')).status === 'not_found');
table('score_verifications').set(single.code, { ...forged, tasks: [{ ...(forged.tasks as Data[])[0], scores: scores(9) }] });
check('a record edited to band 9 is not valid', (await verification.readVerification(single.code)).status === 'not_found');
check('an unknown code is not found', (await verification.readVerification('00000000')).status === 'not_found');

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
