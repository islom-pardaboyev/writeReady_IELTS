/**
 * Compare how different models + prompts score the same IELTS essays.
 *
 * Why this exists: api/feedback.ts was tuned against claude-sonnet-4-6, and its
 * scoring section pushes the band UP in five separate places (see HONEST_EDITS
 * below) with nothing pushing it down. That correction was written for one
 * model's bias. On a model that already scores fairly it inflates instead.
 *
 * Three variants are graded side by side:
 *   old     claude-sonnet-4-6 + current prompt  — what students got before
 *   new     claude-sonnet-5   + current prompt  — what students get now
 *   honest  claude-sonnet-5   + two-sided prompt — the proposed fix
 *
 * It imports buildPrompt from api/feedback.ts, so it always grades the REAL
 * prompt. It never writes to Firestore and never touches a student record.
 *
 *   npx tsx scripts/compare-band-scores.ts --dry    # no API calls, shows cost
 *   npx tsx scripts/compare-band-scores.ts          # runs it (~10-20 cents)
 */

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from '../api/feedback.js';
import { TEST_ESSAYS, expectedOverall, type TestEssay } from './test-essays.js';

/* ── The one-sided rules, and their two-sided replacements ─────────────────
 * Each entry finds the line containing `find` and swaps the whole line. A
 * marker that no longer matches is a hard error, so this can never silently
 * grade the same prompt twice and report it as a difference.            */
const HONEST_EDITS: { find: string; replace: string }[] = [
  {
    find: 'Do NOT demand perfection',
    replace:
      'Apply the band descriptors exactly as written, in both directions. The top bands tolerate minor errors — Band 9 allows "rare errors only, as slips" and Band 8 allows "occasional inaccuracies" — so do not withhold a high band over a handful of small mistakes. Equally, the lower bands exist and must be used: frequent errors, a narrow range, or underdeveloped ideas belong at Band 5 or 6, however hard the student has clearly worked.',
  },
  {
    find: 'do NOT reflexively round down',
    replace:
      'Use the FULL range 4.0–9.0. Use half bands (e.g. 7.5) when the essay sits between two whole bands; pick the closer fit, rounding up or down as the evidence points rather than by habit.',
  },
  {
    find: 'Do NOT cluster essays at Band 7. Band 7 means',
    replace:
      'Do NOT cluster essays at Band 7. Band 7 means "good, but with visible limitations." Judge each essay against the descriptors and award what it has earned: a fluent, precise, fully developed essay is a Band 8 or 9, and an essay with persistent errors, narrow vocabulary or thin ideas is a Band 5 or 6. Excellent, competent and weak essays must all end up with clearly different scores. Point to specific evidence from the essay for the band you award.',
  },
  {
    find: 'do NOT withhold a high band',
    replace:
      "- Award the band the evidence supports, in either direction: give Band 8.0–9.0 when the essay's profile genuinely matches those descriptors, and give Band 4.0–6.0 when it does not. Occasional slips do not block a high band; persistent errors and undeveloped ideas do.",
  },
  {
    find: 'Do NOT compress scores toward the middle',
    replace:
      '- Do NOT compress scores toward the middle. Never inflate a score to encourage the student, and never deflate one to appear rigorous. This student is preparing for a real exam where a stranger will mark them — a score that is too generous does more harm than one that is too harsh, because it tells them they are ready when they are not. The same applies to the written feedback: name the real weaknesses plainly instead of softening them.',
  },
];

function makeHonest(prompt: string): string {
  const lines = prompt.split('\n');
  for (const { find, replace } of HONEST_EDITS) {
    const i = lines.findIndex((l) => l.includes(find));
    if (i === -1) {
      throw new Error(
        `Prompt rule not found: "${find}"\n` +
          `api/feedback.ts changed since this script was written. Re-check ` +
          `HONEST_EDITS against the current buildPrompt before trusting a run.`,
      );
    }
    lines[i] = replace;
  }
  return lines.join('\n');
}

/* ── Variants ──────────────────────────────────────────────────────────── */
interface Variant {
  key: string;
  label: string;
  model: string;
  /** $ per million tokens */
  price: { in: number; out: number };
  /** Sonnet 5 thinks by default; 4.6 does not. Match production for each. */
  thinking?: { type: 'disabled' };
  transform?: (p: string) => string;
}

const VARIANTS: Variant[] = [
  { key: 'old', label: 'sonnet-4-6 · current prompt', model: 'claude-sonnet-4-6', price: { in: 3, out: 15 } },
  { key: 'new', label: 'sonnet-5 · current prompt', model: 'claude-sonnet-5', price: { in: 2, out: 10 }, thinking: { type: 'disabled' } },
  { key: 'honest', label: 'sonnet-5 · honest prompt', model: 'claude-sonnet-5', price: { in: 2, out: 10 }, thinking: { type: 'disabled' }, transform: makeHonest },
];

const MAX_TOKENS = 12000; // same as api/feedback.ts

interface Scores { ta: number; cc: number; lr: number; gra: number; overall: number }
interface Run { scores: Scores | null; costUsd: number; error?: string }

/** Official IELTS rounding, mirroring computeOverallBand in api/feedback.ts —
 *  production ignores the model's own arithmetic, so the test must too. */
function overallBand(ta: number, cc: number, lr: number, gra: number): number {
  const sumN = [ta, cc, lr, gra].map((s) => Math.round(s * 2)).reduce((a, b) => a + b, 0);
  const r = sumN % 4;
  const nearestInt =
    r === 0 ? sumN / 4 :
    r === 1 ? (sumN - 1) / 4 :
    r === 2 ? (sumN + 2) / 4 :
    (sumN + 1) / 4;
  return nearestInt / 2;
}

function parseScores(raw: string): Scores {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const j = JSON.parse(clean) as { scores?: Record<string, number> };
  const s = j.scores ?? {};
  const need = (key: string): number => {
    if (typeof s[key] !== 'number') throw new Error(`missing scores.${key}`);
    return s[key];
  };
  const ta = need('taskAchievement');
  const cc = need('coherenceCohesion');
  const lr = need('lexicalResource');
  const gra = need('grammaticalRangeAccuracy');
  return { ta, cc, lr, gra, overall: overallBand(ta, cc, lr, gra) };
}

async function grade(client: Anthropic, v: Variant, e: TestEssay): Promise<Run> {
  const wordCount = e.essay.trim().split(/\s+/).length;
  let prompt = buildPrompt(e.essay, e.question, e.taskType, wordCount);
  if (v.transform) prompt = v.transform(prompt);

  try {
    const stream = await client.messages.stream({
      model: v.model,
      max_tokens: MAX_TOKENS,
      ...(v.thinking ? { thinking: v.thinking } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    const msg = await stream.finalMessage();
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const costUsd =
      (msg.usage.input_tokens * v.price.in + msg.usage.output_tokens * v.price.out) / 1_000_000;

    if (msg.stop_reason === 'max_tokens') return { scores: null, costUsd, error: 'hit max_tokens' };
    return { scores: parseScores(text), costUsd };
  } catch (err) {
    return { scores: null, costUsd: 0, error: (err as Error).message.slice(0, 90) };
  }
}

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('ANTHROPIC_API_KEY='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch { /* fall through */ }
  throw new Error('ANTHROPIC_API_KEY not found in the environment or .env');
}

const f = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '  – ' : n.toFixed(1).padStart(4));

async function main() {
  const dry = process.argv.includes('--dry');
  const runsArg = process.argv.find((a) => a.startsWith('--runs='));
  const RUNS = runsArg ? Math.max(1, parseInt(runsArg.slice(7), 10) || 1) : 1;

  // Fail loudly before spending anything if the prompt has moved on.
  const sample = TEST_ESSAYS[0];
  makeHonest(buildPrompt(sample.essay, sample.question, sample.taskType, 100));
  console.log(`✓ all ${HONEST_EDITS.length} scoring rules found in the live prompt\n`);

  if (dry) {
    const p = buildPrompt(sample.essay, sample.question, sample.taskType, 100);
    const inTok = Math.ceil(p.length / 4);
    const outTok = 3500; // typical full report
    let total = 0;
    for (const v of VARIANTS) {
      const c = ((inTok * v.price.in + outTok * v.price.out) / 1e6) * TEST_ESSAYS.length * RUNS;
      total += c;
      console.log(`  ${v.label.padEnd(30)} ~$${c.toFixed(3)}`);
    }
    console.log(`\n  ${TEST_ESSAYS.length} essays × ${VARIANTS.length} variants × ${RUNS} run(s) ≈ $${total.toFixed(2)}`);
    console.log('  (the real bill has run about 1.8x this — output is longer than the estimate)');
    console.log('\nDry run — nothing was sent. Drop --dry to run it for real.');
    return;
  }

  const client = new Anthropic({ apiKey: loadApiKey() });
  console.log(`Grading ${TEST_ESSAYS.length} essays × ${VARIANTS.length} variants × ${RUNS} run(s) = ${TEST_ESSAYS.length * VARIANTS.length * RUNS} calls…\n`);

  const results = new Map<string, Run[]>();
  let spent = 0;
  for (const e of TEST_ESSAYS) {
    for (let run = 0; run < RUNS; run++) {
      const batch = await Promise.all(VARIANTS.map((v) => grade(client, v, e)));
      VARIANTS.forEach((v, i) => {
        const key = `${e.id}:${v.key}`;
        results.set(key, [...(results.get(key) ?? []), batch[i]]);
        spent += batch[i].costUsd;
      });
      console.log(`  done: ${e.id} (run ${run + 1}/${RUNS})  spent so far $${spent.toFixed(2)}`);
    }
  }

  /** Mean of a criterion across the successful runs, plus how far they spread. */
  const agg = (key: string, pick: (s: Scores) => number) => {
    const vals = (results.get(key) ?? []).map((r) => r.scores).filter((s): s is Scores => !!s).map(pick);
    if (!vals.length) return null;
    return {
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      range: Math.max(...vals) - Math.min(...vals),
      n: vals.length,
    };
  };

  console.log(`\n${'─'.repeat(78)}`);
  console.log('BAND SCORES  (TA = task, CC = coherence, LR = vocabulary, GRA = grammar)');
  console.log('─'.repeat(78));

  for (const e of TEST_ESSAYS) {
    const want = e.expected;
    const wantOverall = expectedOverall(want);
    console.log(`\n${e.id.toUpperCase()}`);
    console.log(`  Official descriptors put this at ${wantOverall.toFixed(1)} overall:`);
    for (const part of e.because.split('. ').filter(Boolean)) {
      console.log(`    ${part.trim().replace(/\.$/, '')}.`);
    }
    console.log(`\n  ${'variant'.padEnd(30)} ${'TA'.padStart(5)} ${'CC'.padStart(5)} ${'LR'.padStart(5)} ${'GRA'.padStart(5)}  ${'OVERALL'.padStart(8)}  gap   wobble`);
    console.log(`  ${'official (target)'.padEnd(30)} ${f(want.ta)} ${f(want.cc)} ${f(want.lr)} ${f(want.gra)}  ${f(wantOverall).padStart(8)}`);
    for (const v of VARIANTS) {
      const key = `${e.id}:${v.key}`;
      const runs = results.get(key) ?? [];
      const ov = agg(key, (s) => s.overall);
      if (!ov) {
        console.log(`  ${v.label.padEnd(30)}  FAILED: ${runs[0]?.error ?? 'no runs'}`);
        continue;
      }
      // "!" marks a criterion averaging a full band or more off the official one.
      const d = (a: { mean: number } | null, exp: number) => {
        if (!a) return '   – ';
        const t = a.mean.toFixed(1);
        return (Math.abs(a.mean - exp) >= 1 ? `${t}!` : t).padStart(5);
      };
      const gap = ov.mean - wantOverall;
      const flag = Math.abs(gap) >= 1 ? '  <-- off by a band or more' : '';
      const wobble = ov.range === 0 ? 'steady' : `±${(ov.range / 2).toFixed(2)}`;
      console.log(
        `  ${v.label.padEnd(30)} ${d(agg(key, (s) => s.ta), want.ta)} ${d(agg(key, (s) => s.cc), want.cc)}` +
        ` ${d(agg(key, (s) => s.lr), want.lr)} ${d(agg(key, (s) => s.gra), want.gra)}` +
        `  ${ov.mean.toFixed(1).padStart(8)}  ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}  ${wobble.padStart(6)}${flag}`,
      );
    }
    console.log(`  ("!" = criterion off the official band by 1.0+;  wobble = spread across the ${RUNS} identical runs)`);
  }

  console.log(`\n${'─'.repeat(78)}`);
  console.log('AVERAGE GAP vs a real examiner   (+ = too generous, - = too harsh)');
  console.log('─'.repeat(78));
  const sign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  console.log(`  ${'variant'.padEnd(30)} ${'TA'.padStart(6)} ${'CC'.padStart(6)} ${'LR'.padStart(6)} ${'GRA'.padStart(6)}  ${'OVERALL'.padStart(8)}`);
  for (const v of VARIANTS) {
    const per = TEST_ESSAYS
      .map((e) => ({ e, key: `${e.id}:${v.key}` }))
      .filter(({ key }) => agg(key, (s) => s.overall) !== null);
    if (!per.length) { console.log(`  ${v.label.padEnd(30)} no successful runs`); continue; }
    const bias = (pick: (s: Scores) => number, exp: (e: TestEssay) => number) =>
      per.reduce((a, { e, key }) => a + (agg(key, pick)!.mean - exp(e)), 0) / per.length;
    const partial = per.length < TEST_ESSAYS.length ? `  [only ${per.length}/${TEST_ESSAYS.length} essays — INCOMPLETE]` : '';
    console.log(
      `  ${v.label.padEnd(30)} ${sign(bias((s) => s.ta, (e) => e.expected.ta)).padStart(6)}` +
      ` ${sign(bias((s) => s.cc, (e) => e.expected.cc)).padStart(6)}` +
      ` ${sign(bias((s) => s.lr, (e) => e.expected.lr)).padStart(6)}` +
      ` ${sign(bias((s) => s.gra, (e) => e.expected.gra)).padStart(6)}` +
      `  ${sign(bias((s) => s.overall, (e) => expectedOverall(e.expected))).padStart(8)}${partial}`,
    );
  }

  if (RUNS > 1) {
    console.log(`\n${'─'.repeat(78)}`);
    console.log(`RUN-TO-RUN WOBBLE — same essay, same prompt, ${RUNS} runs`);
    console.log('─'.repeat(78));
    let worst = 0;
    for (const v of VARIANTS) {
      const ranges = TEST_ESSAYS
        .map((e) => agg(`${e.id}:${v.key}`, (s) => s.overall))
        .filter((a): a is { mean: number; range: number; n: number } => !!a)
        .map((a) => a.range);
      if (!ranges.length) { console.log(`  ${v.label.padEnd(30)} no successful runs`); continue; }
      const avg = ranges.reduce((a, b) => a + b, 0) / ranges.length;
      worst = Math.max(worst, ...ranges);
      console.log(`  ${v.label.padEnd(30)} average spread ${avg.toFixed(2)} bands, worst ${Math.max(...ranges).toFixed(1)}`);
    }
    console.log(
      worst >= 0.5
        ? `\n  WARNING: up to ${worst.toFixed(1)} bands of movement on identical input.\n` +
          '  Differences smaller than that between variants are noise, not a real effect.'
        : '\n  Scoring is stable across runs, so differences between variants above are real.',
    );
  }

  console.log(`\nSpent: $${spent.toFixed(3)}`);
  console.log('A variant that separates weak from strong AND sits near 0.0 is the one to ship.');
}

main().catch((e) => { console.error('\n' + (e as Error).message); process.exit(1); });
