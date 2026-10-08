/**
 * Offline checks for reading the AI's report reply (api/_lib/bandScore.ts):
 * the slips a long freehand JSON reply has in it are read past, a reply cut
 * off in the middle never is, and the browser and the server always agree on
 * whether a report counts.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/test-report-json.ts
 *
 * The first three cases are the errors in the production logs of 6-8 October
 * 2026, when full reports kept being refunded as "Feedback incomplete".
 */
import { CRITERIA, extractJson, liftReportFields, normalizeScores, readJson } from '../api/_lib/bandScore.js';
import { toFeedbackResult } from '../src/lib/feedbackResult.js';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}

// ── A full Task 2 report, the shape the prompt asks for ─────────────────────
const SCORES = { taskAchievement: 7, coherenceCohesion: 7, lexicalResource: 6.5, grammaticalRangeAccuracy: 6, overall: 6.5 };
const per = <T>(f: (k: string) => T) => Object.fromEntries(CRITERIA.map((k) => [k, f(k)]));
const sentences = Array.from({ length: 16 }, (_, i) => ({
  sentence: `Sentence ${i + 1} of the essay, with 'a quoted phrase' and a figure of ${i * 3}%.`,
  type: i % 3 ? 'grammar' : 'ok',
  feedback: i % 3 ? `Fix the verb in 'it make' (sentence ${i + 1}).` : 'Clear and accurate.',
  improved: i % 3 ? `Sentence ${i + 1}, rewritten at Band 7-8.` : '',
}));
const REPORT = {
  taskType: 'Task 2',
  topic: 'Public transport',
  wordCount: 274,
  evidence: {
    offTask: [],
    questionParts: ['agree or disagree with spending on public transport'],
    coverage: "developed: 'investing in buses'; thin: 'roads'",
    position: "'I strongly believe' kept to the end",
    support: ["'everyone knows' over-general"],
    cohesion: { paragraphs: 4, heavyLapses: ["'This' with no antecedent"], lightLapses: ["'Moreover' twice"] },
    vocabulary: { errors: ["'do a decision' collocation"], precise: ["'congestion'", "'alleviate'"] },
    grammar: { sentences: 16, realErrors: ["'it make' agreement", "'people is' agreement"], slipOnlySentences: 3, complexStructures: 'varied and mostly working' },
  },
  bandRationale: per((k) => `The ${k} ladder line the evidence reaches.`),
  scores: SCORES,
  feedback: per((k) => ({ strengths: [`A ${k} strength.`], issues: [`A ${k} issue, quoting 'the essay'.`] })),
  priorityFixes: ['Fix agreement.', 'Develop the second reason.', 'Vary linkers.'],
  readability: { summary: 'Easy to follow.', tips: [{ problem: 'Long sentence.', original: 'Sentence 3', clearer: 'Shorter.' }] },
  bandGapAnalysis: 'To reach Band 7: fix agreement in most sentences.',
  sampleResponse: 'A model answer.\n\nIts second paragraph.',
  sentenceAnalysis: sentences,
  vocabulary: Array.from({ length: 10 }, (_, i) => ({ word: `word ${i}`, uzbek: `so'z ${i}`, english: `meaning; instead of: 'good'`, exampleFromEssay: `Example ${i}.` })),
  grammar: Array.from({ length: 6 }, (_, i) => ({ kind: i < 4 ? 'mistake' : 'add', point: `Point ${i}`, explanation: 'Why.', yours: `Sentence ${i + 2}`, example: `Fixed ${i}.` })),
};
// The model writes it on one line (the logs say "line 1 column 24425").
const GOOD = JSON.stringify(REPORT);

/** What the server decides (api/feedback.ts readReport): the four bands, or null. */
function serverScores(raw: string) {
  try {
    const { value } = readJson(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    liftReportFields(value as Record<string, unknown>);
    return normalizeScores((value as Record<string, unknown>).scores);
  } catch {
    return null;
  }
}
/** What the feedback page decides (src/pages/FeedbackPage.tsx). */
function pageResult(raw: string) {
  try {
    return toFeedbackResult(extractJson(raw), false, 'Task 2');
  } catch {
    return null;
  }
}
/** The plain parse that production used: its error message, or 'reads'. */
function plainError(raw: string): string {
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return normalizeScores(parsed?.scores) ? 'reads' : 'no scores object';
  } catch (e) {
    return (e as Error).message;
  }
}
const sameScores = (s: ReturnType<typeof serverScores>) => !!s && CRITERIA.every((k) => s[k] === SCORES[k]) && s.overall === SCORES.overall;
/** The whole report reads, every section in its place, on the server and on the page alike. */
function readsWhole(raw: string): boolean {
  const page = pageResult(raw);
  return sameScores(serverScores(raw)) && !!page
    && page.sentenceAnalysis.length === sentences.length && page.vocabulary.length === 10 && (page.grammar?.length ?? 0) === 6
    && CRITERIA.every((k) => page.feedback[k]?.issues.length === 1) && page.priorityFixes.length === 3
    && !!page.readability && page.sampleResponse.includes('\n') && page.bandGapAnalysis !== '';
}

const evidenceEnd = GOOD.indexOf('},"bandRationale"');
const noEvidenceClose = GOOD.slice(0, evidenceEnd) + GOOD.slice(evidenceEnd + 1);

console.log('\nThe errors in the production logs');
{
  check('the model forgot to close "evidence": plain parse fails at the very end, as in the logs',
    plainError(noEvidenceClose).startsWith("Expected ',' or '}' after property value") && plainError(noEvidenceClose).includes(`position ${noEvidenceClose.length}`),
    plainError(noEvidenceClose));
  check('... and now reads, with every section back at the top', readsWhole(noEvidenceClose));

  const extraAtEnd = noEvidenceClose + '}';
  check('the same with a brace too many at the end: plain parse finds "no scores object", as in the logs', plainError(extraAtEnd) === 'no scores object');
  check('... and now reads', readsWhole(extraAtEnd));

  const commaBeforeBrace = GOOD.replace('"improved":"Sentence 2, rewritten at Band 7-8."}', '"improved":"Sentence 2, rewritten at Band 7-8.",}');
  check('a comma before a closing brace: plain parse wants a property name, as in the logs',
    plainError(commaBeforeBrace).startsWith('Expected double-quoted property name'), plainError(commaBeforeBrace));
  check('... and now reads', readsWhole(commaBeforeBrace));
}

console.log('\nOther slips');
{
  check('a valid reply reads as before, not marked repaired', readsWhole(GOOD) && readJson(GOOD).repaired === false);
  check('a valid reply is read exactly as JSON.parse reads it', JSON.stringify(extractJson(GOOD)) === GOOD);
  check('nothing in a valid report is moved', liftReportFields(JSON.parse(GOOD)) === false);
  check('nothing in a score-only report is moved', liftReportFields({ ...JSON.parse(GOOD), feedback: undefined, sentenceAnalysis: undefined, vocabulary: undefined, grammar: undefined }) === false);
  check('a comma before a closing bracket', readsWhole(GOOD.replace('"Vary linkers."]', '"Vary linkers.",]')));
  check('a comma missing between two items', readsWhole(GOOD.replace('"improved":""},{"sentence":"Sentence 2', '"improved":""}{"sentence":"Sentence 2')));
  check('a comma missing between two keys', readsWhole(GOOD.replace('"topic":"Public transport",', '"topic":"Public transport"\n  ')));
  check('a brace too many between two items', readsWhole(GOOD.replace('"improved":""},{"sentence":"Sentence 2', '"improved":""}},{"sentence":"Sentence 2')));
  check('a brace too many closing the whole reply early', readsWhole(GOOD.replace(',"bandGapAnalysis"', '},"bandGapAnalysis"')));
  check('an array never closed', readsWhole(GOOD.replace('"clearer":"Shorter."}]}', '"clearer":"Shorter."}}')));
  check('an object in an array never closed', readsWhole(GOOD.replace('"example":"Fixed 5."}]', '"example":"Fixed 5."]')));
  check('the last two brackets left off', readsWhole(GOOD.slice(0, -2)));
  check('a code fence around it', readsWhole('```json\n' + noEvidenceClose + '\n```'));
  check('a double quote left unescaped inside text', readsWhole(GOOD.replace("Fix the verb in 'it make' (sentence 2).", 'Fix the verb in "it make", which is wrong.')));
  check('a raw line break inside text', readsWhole(GOOD.replace('Clear and accurate.', 'Clear\nand accurate.')));

  const scoresClosedEarly = GOOD.replace('"taskAchievement":7,"coherenceCohesion":7', '"taskAchievement":7}},"coherenceCohesion":7');
  check('scores closed after one band: the other bands go back into scores', readsWhole(scoresClosedEarly), plainError(scoresClosedEarly));
  const feedbackClosedEarly = GOOD.replace(/("feedback":\{"taskAchievement":\{[^}]*\})/, '$1}');
  check('feedback closed after one criterion: the others go back into feedback', readsWhole(feedbackClosedEarly));
}

console.log('\nNever more than the reply says');
{
  const noScores = JSON.stringify({ ...REPORT, scores: undefined });
  check('a reply with no scores still has none', serverScores(noScores) === null && pageResult(noScores) === null);
  const threeBands = JSON.stringify({ ...REPORT, scores: { taskAchievement: 7, coherenceCohesion: 7, lexicalResource: 6.5 } });
  check('a reply with three bands still has no scores', serverScores(threeBands) === null);
  const proto = extractJson(GOOD.replace('"topic":', '"__proto__":{"tips":["x"]},"topic":').slice(0, -1)) as Record<string, unknown>;
  check('a "__proto__" key in a repaired reply changes nothing', Object.getPrototypeOf(proto) === Object.prototype && !('tips' in proto));
  const cutAfterScores = GOOD.slice(0, GOOD.indexOf('"sentenceAnalysis"') + 60);
  check('a reply cut off after its scores is still unreadable', serverScores(cutAfterScores) === null && pageResult(cutAfterScores) === null);

  // A reply stopped anywhere (the token cap, a dropped connection) must never
  // pass for a whole one. The exception is a stop right after a closing
  // bracket, which looks exactly like a reply that ended a bracket short; the
  // server still refuses those when the API says the cap was hit.
  let readable = 0;
  let cuts = 0;
  for (let i = 1; i < GOOD.length - 1; i++) {
    if ('}]'.includes(GOOD[i - 1])) continue;
    cuts++;
    if (serverScores(GOOD.slice(0, i)) || pageResult(GOOD.slice(0, i))) readable++;
  }
  check(`none of ${cuts} cut-off replies reads`, readable === 0, `${readable} read`);
}

console.log('\nOne bracket or comma wrong, anywhere in the reply');
{
  // Every single bracket or comma in the report: left out, written twice, or
  // with a comma added after it. Each variant must either read whole, or not
  // read at all on both sides: a report read on the page but refunded by the
  // server (or the other way round) would tell the student the wrong thing.
  const spots = [...GOOD].flatMap((c, i) => ('{}[],'.includes(c) ? [i] : []));
  const slips = ['left out', 'doubled', 'comma after'] as const;
  const slip = (text: string, i: number, kind: (typeof slips)[number]) =>
    kind === 'left out' ? text.slice(0, i) + text.slice(i + 1)
      : text.slice(0, i + 1) + (kind === 'doubled' ? text[i] : ',') + text.slice(i + 1);

  let total = 0;
  let whole = 0;
  let scored = 0;
  let disagree = 0;
  const lost: string[] = [];
  for (const i of spots) {
    for (const kind of slips) {
      const variant = slip(GOOD, i, kind);
      total++;
      if (sameScores(serverScores(variant))) scored++;
      if (readsWhole(variant)) whole++;
      else if (lost.length < 3) lost.push(`${GOOD[i]} ${kind} at ${i}`);
      if ((serverScores(variant) === null) !== (pageResult(variant) === null)) disagree++;
    }
  }
  console.log(`  one slip: ${scored} of ${total} keep their scores, ${whole} read whole (${(whole / total * 100).toFixed(1)}%)${lost.length ? `; not whole: ${lost.join(', ')}` : ''}`);
  check('every single slip keeps the right scores', scored === total, `${total - scored} lost`);
  check('at least 97% of single slips read whole', whole / total >= 0.97);
  check('the server and the page agree on every single slip', disagree === 0, `${disagree} disagree`);

  // Two slips in one reply, at places picked the same way every run.
  let seed = 12345;
  const pick = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const RUNS = 2000;
  let scored2 = 0;
  let whole2 = 0;
  let disagree2 = 0;
  for (let n = 0; n < RUNS; n++) {
    // The later place first, so the earlier one's index still holds.
    const [a, b] = [spots[pick(spots.length)], spots[pick(spots.length)]].sort((x, y) => y - x);
    const variant = slip(slip(GOOD, a, slips[pick(3)]), b, slips[pick(3)]);
    if (sameScores(serverScores(variant))) scored2++;
    if (readsWhole(variant)) whole2++;
    if ((serverScores(variant) === null) !== (pageResult(variant) === null)) disagree2++;
  }
  console.log(`  two slips: ${scored2} of ${RUNS} keep their scores, ${whole2} read whole (${(whole2 / RUNS * 100).toFixed(1)}%)`);
  check('at least 99% of double slips keep the right scores', scored2 / RUNS >= 0.99);
  check('the server and the page agree on every double slip', disagree2 === 0, `${disagree2} disagree`);
}

console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
