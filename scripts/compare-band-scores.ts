/**
 * Checks the live scoring prompt against the reference essays in
 * scripts/test-essays.ts.
 *
 * Each essay is graded by both reports a student can get:
 *
 *   full   the paid / bonus report (buildPromptParts in api/feedback.ts)
 *   free   the weekly score-only report (buildLimitedPromptParts)
 *
 * The two must give the same bands, because the free report is smaller, not
 * softer. Both must land near the official bands in test-essays.ts, including
 * the honesty checks: an off-topic essay, an essay that asks for Band 9, one
 * far under the word count, and a Task 1 answer whose figures do not match
 * the chart.
 *
 * Requests are built exactly like production: the same prompt halves, the
 * same cache breakpoint, the same chart block, the same score rules
 * (api/_lib/bandScore.ts). It never writes to Firestore and never touches a
 * student record. It does spend API credit.
 *
 *   npx tsx scripts/compare-band-scores.ts --dry             # cost estimate, no calls
 *   npx tsx scripts/compare-band-scores.ts --runs=2          # ~$1.50
 *   npx tsx scripts/compare-band-scores.ts --only=weak,off-topic --variants=full
 */

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { chartBlock, limitedPromptParts, promptParts } from '../api/feedback.js';
import { extractJson, normalizeScores } from '../api/_lib/bandScore.js';
import { TEST_ESSAYS, expectedOverall, type TestEssay } from './test-essays.js';

/* ── Variants ──────────────────────────────────────────────────────────── */
interface Variant {
  key: string;
  label: string;
  maxTokens: number;
  parts: typeof promptParts;
}

const MODEL = 'claude-sonnet-5'; // same as api/feedback.ts
const PRICE = { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.2 }; // $ per million tokens

const VARIANTS: Variant[] = [
  { key: 'full', label: 'full report (paid)', maxTokens: 12000, parts: promptParts },
  { key: 'free', label: 'free report (score only)', maxTokens: 2000, parts: limitedPromptParts },
];

interface Scores { ta: number; cc: number; lr: number; gra: number; overall: number }
interface Run { scores: Scores | null; costUsd: number; error?: string }

function chartFor(e: TestEssay) {
  if (!e.chartFile) return null;
  const bytes = readFileSync(new URL(e.chartFile, import.meta.url));
  const block = chartBlock(`data:image/jpeg;base64,${bytes.toString('base64')}`);
  if (!block) throw new Error(`${e.chartFile} could not be turned into a chart block`);
  return block;
}

async function grade(client: Anthropic, v: Variant, e: TestEssay): Promise<Run> {
  const wordCount = e.essay.trim().split(/\s+/).filter(Boolean).length;
  const chart = chartFor(e);
  const { cacheable, variable } = v.parts(e.essay, e.question, e.taskType, wordCount, chart !== null);

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: v.maxTokens,
      thinking: { type: 'disabled' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: cacheable, cache_control: { type: 'ephemeral' } },
          ...(chart ? [chart] : []),
          { type: 'text', text: variable },
        ],
      }],
    });
    const msg = await stream.finalMessage();
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const u = msg.usage;
    const costUsd = (
      u.input_tokens * PRICE.in
      + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite
      + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead
      + u.output_tokens * PRICE.out
    ) / 1_000_000;

    if (msg.stop_reason === 'max_tokens') return { scores: null, costUsd, error: 'hit max_tokens' };
    const s = normalizeScores((extractJson(text) as { scores?: unknown }).scores);
    if (!s) return { scores: null, costUsd, error: 'no usable scores' };
    return {
      scores: { ta: s.taskAchievement, cc: s.coherenceCohesion, lr: s.lexicalResource, gra: s.grammaticalRangeAccuracy, overall: s.overall },
      costUsd,
    };
  } catch (err) {
    return { scores: null, costUsd: 0, error: (err as Error).message.slice(0, 120) };
  }
}

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('ANTHROPIC_API_KEY'));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch { /* fall through */ }
  throw new Error('ANTHROPIC_API_KEY not found in the environment or .env');
}

const f = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '  – ' : n.toFixed(1).padStart(4));
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const dry = process.argv.includes('--dry');
  const RUNS = Math.max(1, parseInt(arg('runs') ?? '1', 10) || 1);
  const only = arg('only')?.split(',');
  const essays = only ? TEST_ESSAYS.filter((e) => only.includes(e.id)) : TEST_ESSAYS;
  const wanted = arg('variants')?.split(',');
  const variants = wanted ? VARIANTS.filter((v) => wanted.includes(v.key)) : VARIANTS;
  if (!essays.length || !variants.length) throw new Error('Nothing to run: check --only and --variants.');

  if (dry) {
    // Rough: a full report writes ~4,500 tokens, a free one ~700.
    const perCall = (v: Variant) => (5000 * PRICE.in + (v.key === 'full' ? 4500 : 700) * PRICE.out) / 1e6;
    const total = variants.reduce((a, v) => a + perCall(v) * essays.length * RUNS, 0);
    console.log(`${essays.length} essays × ${variants.length} variants × ${RUNS} run(s) ≈ $${total.toFixed(2)}`);
    console.log('Dry run — nothing was sent. Drop --dry to run it for real.');
    return;
  }

  const client = new Anthropic({ apiKey: loadApiKey() });
  console.log(`Grading ${essays.length} essays × ${variants.length} variants × ${RUNS} run(s) = ${essays.length * variants.length * RUNS} calls…\n`);

  const results = new Map<string, Run[]>();
  let spent = 0;
  for (const e of essays) {
    for (let run = 0; run < RUNS; run++) {
      const batch = await Promise.all(variants.map((v) => grade(client, v, e)));
      variants.forEach((v, i) => {
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
    return { mean: vals.reduce((a, b) => a + b, 0) / vals.length, range: Math.max(...vals) - Math.min(...vals) };
  };

  console.log(`\n${'─'.repeat(80)}`);
  console.log('BAND SCORES  (TA = task, CC = coherence, LR = vocabulary, GRA = grammar)');
  console.log('─'.repeat(80));

  for (const e of essays) {
    const want = e.expected;
    const wantOverall = expectedOverall(want);
    console.log(`\n${e.id.toUpperCase()}${e.chartFile ? '  (chart attached)' : ''}`);
    console.log(`  Official descriptors put this at ${wantOverall.toFixed(1)} overall:`);
    for (const part of e.because.split('. ').filter(Boolean)) {
      console.log(`    ${part.trim().replace(/\.$/, '')}.`);
    }
    console.log(`\n  ${'variant'.padEnd(26)} ${'TA'.padStart(5)} ${'CC'.padStart(5)} ${'LR'.padStart(5)} ${'GRA'.padStart(5)}  ${'OVERALL'.padStart(8)}  gap   wobble`);
    console.log(`  ${'official (target)'.padEnd(26)} ${f(want.ta)} ${f(want.cc)} ${f(want.lr)} ${f(want.gra)}  ${f(wantOverall).padStart(8)}`);
    for (const v of variants) {
      const key = `${e.id}:${v.key}`;
      const ov = agg(key, (s) => s.overall);
      if (!ov) {
        console.log(`  ${v.label.padEnd(26)}  FAILED: ${results.get(key)?.[0]?.error ?? 'no runs'}`);
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
        `  ${v.label.padEnd(26)} ${d(agg(key, (s) => s.ta), want.ta)} ${d(agg(key, (s) => s.cc), want.cc)}` +
        ` ${d(agg(key, (s) => s.lr), want.lr)} ${d(agg(key, (s) => s.gra), want.gra)}` +
        `  ${ov.mean.toFixed(1).padStart(8)}  ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}  ${wobble.padStart(6)}${flag}`,
      );
    }
  }

  console.log(`\n${'─'.repeat(80)}`);
  console.log('AVERAGE GAP vs the official bands   (+ = too generous, - = too harsh)');
  console.log('─'.repeat(80));
  const sign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  for (const v of variants) {
    const per = essays.map((e) => ({ e, key: `${e.id}:${v.key}` })).filter(({ key }) => agg(key, (s) => s.overall));
    if (!per.length) { console.log(`  ${v.label.padEnd(26)} no successful runs`); continue; }
    const bias = per.reduce((a, { e, key }) => a + (agg(key, (s) => s.overall)!.mean - expectedOverall(e.expected)), 0) / per.length;
    const absGap = per.reduce((a, { e, key }) => a + Math.abs(agg(key, (s) => s.overall)!.mean - expectedOverall(e.expected)), 0) / per.length;
    const partial = per.length < essays.length ? `  [only ${per.length}/${essays.length} essays]` : '';
    console.log(`  ${v.label.padEnd(26)} average gap ${sign(bias)}, average distance ${absGap.toFixed(2)} bands${partial}`);
  }

  if (variants.length === 2) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log('FREE vs FULL — the same essay must get the same overall band');
    console.log('─'.repeat(80));
    for (const e of essays) {
      const a = agg(`${e.id}:full`, (s) => s.overall);
      const b = agg(`${e.id}:free`, (s) => s.overall);
      if (a && b) console.log(`  ${e.id.padEnd(24)} full ${a.mean.toFixed(1)}  free ${b.mean.toFixed(1)}  difference ${sign(b.mean - a.mean)}`);
    }
  }

  console.log(`\nSpent: $${spent.toFixed(3)}`);
}

main().catch((e) => { console.error('\n' + (e as Error).message); process.exit(1); });
