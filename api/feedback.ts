import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';
import { createHmac, timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { initFirebase, currentMonthKey, currentWeekKey } from './_lib/shared.js';
import { CRITERIA, extractJson, normalizeScores, type BandScores } from './_lib/bandScore.js';

const ALLOWED_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 12000;
// The free weekly report is short, but it still writes a band rationale for
// all four criteria, because that reasoning is what makes its score match a
// paid one. 800 was sized for a single rationale and would now truncate, which
// costs the student the report and refunds it. max_tokens is a cap, not a
// charge: only tokens actually written are billed, so the headroom is free.
const LIMITED_MAX_TOKENS = 2000;
const TOKEN_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes

// Real IELTS answers are 150-400 words. These limits leave plenty of room for
// a long essay while stopping anyone from sending a book through a paid model.
const MAX_ESSAY_WORDS = 1000;
const MAX_ESSAY_CHARS = 10_000;
const MAX_QUESTION_CHARS = 3_000;

// One document per spent pre-check token. The token is the only thing that
// proves a report was paid for, so each one may start exactly one report.
const USED_TOKENS = 'used_report_tokens';

/**
 * Which allowance pre-check charged. See CreditSource in api/pre-check.ts:
 * 'paid' and 'bonus' both earn the full report, 'free' is the score-only one.
 */
type CreditSource = 'paid' | 'bonus' | 'free';

function verifyToken(raw: string): { uid: string; source: CreditSource; sig: string } {
  const secret = process.env.NONCE_SECRET;
  // Never fall back to a default: a secret written in the source code would
  // let anyone sign their own tokens and get free reports.
  if (!secret) throw new Error('NO_SECRET');
  const parts = raw.split('.');
  if (parts.length !== 4) throw new Error('INVALID_TOKEN');
  const [b64uid, flag, ts, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${b64uid}.${flag}.${ts}`).digest('hex');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('INVALID_TOKEN');
  }
  if (!(Date.now() - Number(ts) <= TOKEN_MAX_AGE_MS)) throw new Error('TOKEN_EXPIRED');
  if (flag !== 'paid' && flag !== 'bonus' && flag !== 'free') throw new Error('INVALID_TOKEN');
  return { uid: Buffer.from(b64uid, 'base64url').toString(), source: flag, sig };
}

/**
 * Marks a token as spent. create() fails if the document already exists, so
 * two requests racing with the same token cannot both get through. Without
 * this, one paid credit bought as many reports as a script could send in the
 * token's three minutes.
 */
async function spendToken(sig: string, uid: string): Promise<boolean> {
  try {
    await getFirestore().collection(USED_TOKENS).doc(sig).create({
      uid,
      usedAt: FieldValue.serverTimestamp(),
      // For an optional Firestore TTL policy on this field. A token is dead
      // after three minutes anyway, so a day is generous.
      expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw e;
  }
}

// Reverse the credit that pre-check deducted, so a failed/truncated report
// never costs the user a report from their monthly/weekly/bonus allowance.
async function refundCredit(uid: string, source: CreditSource): Promise<void> {
  try {
    initFirebase();
    if (!getApps().length) return;
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const data = snap.data()!;
      // The token says exactly which allowance was charged, so put it back there.
      if (source === 'bonus') {
        const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
        tx.set(userRef, { bonusAnalyses: bonus + 1 }, { merge: true });
        return;
      }
      if (source === 'free') {
        const weekKey = currentWeekKey();
        const freeUsage = data.freeUsage;
        if (freeUsage?.weekKey === weekKey && typeof freeUsage.count === 'number' && freeUsage.count > 0) {
          tx.set(userRef, { freeUsage: { weekKey, count: freeUsage.count - 1 } }, { merge: true });
        }
        return;
      }
      const monthKey = currentMonthKey();
      const usage = data.usage ?? {};
      if (usage.monthKey === monthKey && typeof usage.count === 'number' && usage.count > 0) {
        tx.set(userRef, { usage: { monthKey, count: usage.count - 1 } }, { merge: true });
      }
    });
  } catch { /* best-effort refund; never throw from here */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { essayText, questionText, taskType, preCheckToken } = req.body ?? {};
  if (typeof preCheckToken !== 'string' || !preCheckToken) {
    return res.status(401).json({ error: 'preCheckToken is required. Call /api/pre-check first.' });
  }

  let uid: string;
  let source: CreditSource;
  let sig: string;
  try {
    ({ uid, source, sig } = verifyToken(preCheckToken));
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'NO_SECRET') {
      console.error('feedback: NONCE_SECRET is not set');
      return res.status(500).json({ error: 'AI feedback is not set up correctly. Please contact @writeready_admin on Telegram.' });
    }
    if (msg === 'TOKEN_EXPIRED') return res.status(401).json({ error: 'Session expired. Please try again.' });
    return res.status(401).json({ error: 'Invalid session token. Please try again.' });
  }

  // Spend the token before anything else, including the checks below that
  // refund the credit. Otherwise one token could be replayed with a bad
  // request over and over, collecting a refund every time.
  try {
    initFirebase();
    if (!(await spendToken(sig, uid))) {
      return res.status(409).json({ error: 'This report request was already used. Please try again.' });
    }
  } catch (e) {
    console.error('feedback: could not record the token:', e);
    await refundCredit(uid, source);
    return res.status(503).json({ error: 'AI feedback is temporarily unavailable right now — you were not charged. Please try again shortly.' });
  }

  const reject = async (status: number, error: string) => {
    await refundCredit(uid, source);
    return res.status(status).json({ error });
  };

  if (typeof essayText !== 'string' || !essayText.trim() || typeof questionText !== 'string' || !questionText.trim()) {
    return reject(400, 'essayText and questionText are required.');
  }
  if (taskType !== 'Task 1' && taskType !== 'Task 2') {
    return reject(400, 'taskType must be "Task 1" or "Task 2".');
  }
  const wordCount = essayText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_ESSAY_WORDS || essayText.length > MAX_ESSAY_CHARS) {
    return reject(413, `Your essay is ${wordCount} words. The checker accepts up to ${MAX_ESSAY_WORDS} words (IELTS answers are usually 150–400). You were not charged.`);
  }
  if (questionText.length > MAX_QUESTION_CHARS) {
    return reject(413, 'The question is too long to mark. You were not charged.');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('feedback: ANTHROPIC_API_KEY is not set');
    return reject(500, 'AI feedback is not set up correctly. Please contact @writeready_admin on Telegram.');
  }

  const anthropic = new Anthropic({ apiKey });
  // Only the automatic weekly free report is the score-only one. An
  // admin-granted bonus is a reward, so it buys the same full report a paying
  // student gets.
  const isScoreOnly = source === 'free';
  const { cacheable, variable } = isScoreOnly
    ? limitedPromptParts(essayText, questionText, taskType, wordCount)
    : promptParts(essayText, questionText, taskType, wordCount);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  let raw = '';
  try {
    const stream = await anthropic.messages.stream({
      model: ALLOWED_MODEL,
      max_tokens: isScoreOnly ? LIMITED_MAX_TOKENS : MAX_TOKENS,
      // Sonnet 5 runs adaptive thinking when `thinking` is omitted. Thinking
      // tokens bill as output and share the MAX_TOKENS budget with the JSON
      // report, so leaving it on would push long essays into the cap. The
      // bandRationale field already makes the model reason before it scores.
      // Sonnet 5 does not accept `temperature`, so there is no knob for
      // run-to-run variation; scripts/compare-band-scores.ts measures it.
      thinking: { type: 'disabled' },
      // The fixed half carries the cache breakpoint. On a hit those tokens bill
      // at ~0.1x instead of full price, which is most of the cost of a report;
      // on a miss the write costs ~1.25x, so it pays from the second request
      // sharing this task type within the 5-minute window.
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: cacheable, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variable },
        ],
      }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        raw += chunk.delta.text;
        res.write(chunk.delta.text);
      }
    }

    res.end();

    // A report the student cannot use is never charged and never saved. That
    // covers a reply cut off at the token cap, a refusal, and any reply
    // without four real scores. The browser applies the same test
    // (src/pages/FeedbackPage.tsx), so "Feedback incomplete" there always
    // means the credit came back here. A report that failed used to be saved
    // with made-up 6.0 scores, which then showed up in the student's progress
    // chart and on the leaderboard as if they were real.
    let stopReason: string | null = null;
    try { stopReason = (await stream.finalMessage()).stop_reason; } catch { /* ignore */ }
    const report = stopReason === 'max_tokens' ? null : readReport(raw);
    if (!report) {
      await refundCredit(uid, source);
      return;
    }

    // This has to be awaited: the response has already been streamed and
    // ended, and a serverless function can be frozen the moment its handler
    // returns, which used to lose reports at random.
    try {
      await getFirestore().collection('feedback_reports').add({
        uid,
        taskType,
        topic: report.topic,
        scores: report.scores,
        // Which allowance paid for it, so the admin can tell a bonus report
        // from a plan report and from the weekly free one.
        source,
        issues: report.issues,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Never fail the request over this: the student already has their report.
      console.error('feedback_reports save failed:', e);
    }
  } catch (err) {
    // Log the real error (e.g. Claude API unavailable / out of credits) for the
    // admin, but never expose the raw provider message — it can leak billing
    // details. The credit was deducted in pre-check, so refund it here.
    console.error('feedback error:', err);
    await refundCredit(uid, source);
    if (!res.headersSent) {
      return res.status(503).json({ error: 'AI feedback is temporarily unavailable right now — you were not charged. Please try again shortly, or contact @writeready_admin on Telegram if it keeps happening.' });
    }
    try { res.end(); } catch { /* stream already closed */ }
  }
}

/** What gets saved from a finished report, or null when it has no real scores. */
function readReport(raw: string): { topic: string; scores: BandScores; issues: string[] } | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const scores = normalizeScores(parsed?.scores);
  if (!scores) return null;
  const feedback = (parsed.feedback ?? {}) as Record<string, { issues?: unknown } | undefined>;
  const issues = CRITERIA.flatMap((k) => {
    const list = feedback[k]?.issues;
    return Array.isArray(list) ? list.filter((i): i is string => typeof i === 'string') : [];
  });
  const topic = typeof parsed.topic === 'string' && parsed.topic.trim() ? parsed.topic.trim().slice(0, 80) : 'General';
  return { topic, scores, issues };
}

// Source: official IELTS Writing Band Descriptors PDF (updated May 2023).
// Task Achievement/Response and length-penalty wording is task-specific
// (Task 1 uses Academic/GT bullet-point language; Task 2 uses prompt/position
// language). Coherence & Cohesion, Lexical Resource, and Grammatical Range &
// Accuracy differ only slightly in phrasing between the two tasks in the
// official doc, so those three are shared here to keep the prompt compact.
function bandDescriptors(taskType: string): string {
  const isTask1 = taskType === 'Task 1';
  const minWords = isTask1 ? 150 : 250;

  const taskCriterion = isTask1
    ? `TASK ACHIEVEMENT (Task 1 — describing data/process/map/letter):
- Band 9: All requirements fully and appropriately satisfied; extremely rare lapses in content.
- Band 8: Covers requirements appropriately, relevantly, sufficiently. (Academic) Key features skilfully selected, clearly presented/highlighted/illustrated. (GT) All bullet points clearly presented, appropriately illustrated/extended. Occasional omissions/lapses only.
- Band 7: Covers requirements; content relevant/accurate, appropriate format, a few omissions/lapses possible. (Academic) Key features covered and clearly highlighted but could be fuller; clear overview, data appropriately categorised, main trends/differences identified. (GT) All bullet points covered and clearly highlighted but could be fuller; clear purpose; consistent tone; minimal lapses.
- Band 6: Focuses on requirements, appropriate format. (Academic) Key features covered and adequately highlighted; relevant overview attempted; info supported with data. (GT) All bullet points covered and adequately highlighted; purpose generally clear; minor tone inconsistencies. Some irrelevant/inaccurate info in details; some details missing/excessive.
- Band 5: Only generally addresses requirements; format may be wrong in places. (Academic) Key features not adequately covered; recounting mechanical; may have NO data to support the description. (GT) Bullet points presented but one+ not adequately covered; purpose unclear at times; tone variable/inappropriate. Tends to focus on details without the bigger picture; irrelevant/inaccurate material in key areas.
- Band 4: An attempt to address the task. (Academic) Few key features selected. (GT) Not all bullet points presented; purpose of letter unclear/confused; tone may be inappropriate. Format may be inappropriate; key features/bullet points may be irrelevant, repetitive, inaccurate.`
    : `TASK RESPONSE (Task 2 — essay):
- Band 9: Prompt appropriately addressed and explored in depth; clear, fully developed position directly answering the question(s); ideas relevant, fully extended, well supported; lapses extremely rare.
- Band 8: Prompt appropriately and sufficiently addressed; clear, well-developed position; ideas relevant, well extended and supported; occasional omissions/lapses only.
- Band 7: Main parts of the prompt appropriately addressed; clear, developed position; main ideas extended/supported but may over-generalise or lack focus/precision in places.
- Band 6: Main parts addressed (some more fully than others), appropriate format; position directly relevant but conclusions may be unclear/unjustified/repetitive; main ideas relevant but some insufficiently developed or lacking clarity; some supporting evidence less relevant/adequate.
- Band 5: Main parts incompletely addressed; format may be wrong in places; position expressed but development not always clear; some main ideas limited/underdeveloped, possible irrelevant detail, some repetition.
- Band 4: Prompt tackled minimally or tangentially (possible misunderstanding); format may be inappropriate; position discernible but reader must search for it; main ideas hard to identify or lack relevance/clarity/support; large parts may be repetitive.`;

  return `${taskCriterion}

LENGTH (official rules, not a soft guideline): minimum ${minWords} words for ${taskType}. Responses of 20 words or fewer are automatically Band 1 on ALL four criteria. Significantly underlength responses can be capped around Band 3 on Lexical Resource / Grammatical Range & Accuracy since the resource/structures used can't be judged. For a moderately underlength response, treat it as a genuine weakness in Task Achievement/Response (main ideas or key features will usually be underdeveloped) rather than applying an arbitrary numeric cap.

COHERENCE & COHESION (both tasks):
- Band 9: Message followed effortlessly; cohesion rarely draws attention; lapses minimal; paragraphing skilfully managed.
- Band 8: Followed with ease; info/ideas logically sequenced, cohesion well managed; occasional lapses; paragraphing sufficient and appropriate.
- Band 7: Logically organised, clear progression (a few minor lapses possible); cohesive devices incl. reference/substitution used flexibly but with some inaccuracies or over/under use; paragraphing generally effective.
- Band 6: Generally arranged coherently, clear overall progression; cohesive devices used to good effect but may be faulty/mechanical (misuse, overuse, omission); reference/substitution may lack flexibility, causing some repetition/error; paragraphing not always logical.
- Band 5: Organisation evident but not wholly logical, lacking overall progression, though a sense of underlying coherence exists; ideas' relationship can be followed but sentences aren't fluently linked; limited/overused cohesive devices with inaccuracy; may be repetitive; paragraphing may be inadequate or missing.
- Band 4: Info/ideas evident but not coherently arranged; no clear progression; relationships between ideas unclear/inadequately marked; basic cohesive devices only, may be inaccurate/repetitive; inaccurate use or lack of substitution/referencing; little or no paragraphing.

LEXICAL RESOURCE (both tasks):
- Band 9: Full flexibility and precise use; wide vocabulary used accurately, naturally, sophisticated control; minor spelling/word-formation errors extremely rare, minimal impact.
- Band 8: Wide resource fluently/flexibly used for precise meaning; skilful use of uncommon/idiomatic items despite occasional inaccuracies in word choice/collocation; occasional spelling/word-formation errors, minimal impact.
- Band 7: Resource sufficient for some flexibility/precision; some ability to use less common/idiomatic items; awareness of style/collocation evident though inappropriacies occur; only a few spelling/word-formation errors, not detracting from clarity.
- Band 6: Resource generally adequate; meaning generally clear despite restricted range/lack of precision; a risk-taker shows wider vocabulary but more inaccuracy; some spelling/word-formation errors that don't impede communication.
- Band 5: Resource limited but minimally adequate; simple vocabulary may be accurate but range doesn't permit variation; frequent lapses in word-choice appropriacy, frequent simplification/repetition; noticeable spelling/word-formation errors causing some difficulty.
- Band 4: Resource limited/inadequate for, or unrelated to, the task; vocabulary basic, repetitive; inappropriate use of memorised/formulaic chunks or input-material language; word choice/formation/spelling errors may impede meaning.

GRAMMATICAL RANGE & ACCURACY (both tasks):
- Band 9: Wide range used with full flexibility/control; punctuation and grammar appropriate throughout; minor errors extremely rare, minimal impact.
- Band 8: Wide range flexibly/accurately used; majority of sentences error-free; punctuation well managed; occasional non-systematic errors, minimal impact.
- Band 7: Variety of complex structures with some flexibility/accuracy; grammar/punctuation generally well controlled; error-free sentences frequent; a few errors may persist but don't impede communication.
- Band 6: Mix of simple/complex sentence forms but limited flexibility; complex structures less accurate than simple ones; grammar/punctuation errors occur but rarely impede communication.
- Band 5: Range limited and rather repetitive; complex sentences attempted but tend to be faulty, greatest accuracy on simple sentences; grammatical errors may be frequent, causing some difficulty; punctuation may be faulty.
- Band 4: Very limited range; subordinate clauses rare, simple sentences predominate; some structures accurate but grammatical errors frequent and may impede meaning; punctuation often faulty/inadequate.`;
}

/* ── Scoring, shared by both reports ──────────────────────────────────────
 *
 * The free weekly report and a paid report must award the SAME band for the
 * same essay: the free one is smaller, not softer. So every instruction that
 * can move a score lives in the four blocks below and is used, verbatim, by
 * both prompts. Only the extra OUTPUT sections differ (sentence analysis,
 * vocabulary, grammar, sample answer, band-gap analysis), because those are
 * what a paid plan pays for.
 *
 * Edit a scoring rule here and it changes for both. That is the point: the
 * two prompts used to keep their own condensed copies, and the free one drifted
 * into a softer, vaguer version that scored the same essay differently.        */

function examinerPreamble(): string {
  return `You are a certified, experienced IELTS examiner. Score this essay accurately using the official IELTS best-fit method and the band descriptors below — not your own idea of "good writing." Be fair and calibrated: award high bands (8.0–9.0) to genuinely strong essays and low bands to weak ones. Under-scoring a strong essay is just as wrong as over-scoring a weak one. Return ONLY valid JSON — no markdown, no backticks, no extra text.`;
}

function essayBlock(essay: string, question: string, taskType: string, wordCount: number): string {
  return `=== THE ESSAY TO MARK ===
TASK TYPE: ${taskType}
QUESTION: ${question}
STUDENT ESSAY (${wordCount} words):
${essay}`;
}

function scoringMethod(): string {
  return `=== SCORING METHOD (official IELTS best-fit) ===
For EACH of the 4 criteria, choose the band whose descriptor BEST matches the essay's overall profile — exactly as a real IELTS examiner does. Best-fit means matching the closest overall description; NOT every feature of a band must be present, and one or two features sitting slightly higher or lower does not change the best-fit band.

Apply the band descriptors exactly as written, in both directions. The top bands tolerate minor errors — Band 9 allows "rare errors only, as slips" and Band 8 allows "occasional inaccuracies" — so do not withhold a high band over a handful of small mistakes. Equally, the lower bands exist and must be used: frequent errors, a narrow range, or underdeveloped ideas belong at Band 5 or 6, however hard the student has clearly worked.

Use the FULL range 4.0–9.0. Use half bands (e.g. 7.5) when the essay sits between two whole bands; pick the closer fit, rounding up or down as the evidence points rather than by habit.

Calibration anchors — score each criterion independently against these:
- Band 9.0: near-native — precise, wide, natural vocabulary; varied structures that are virtually all error-free; fully developed, well-supported ideas; effortless, seamless cohesion. Errors are rare slips only.
- Band 8.0–8.5: fluent and flexible — a wide vocabulary used naturally with only occasional slips; a wide range of structures where the great majority of sentences are error-free; well-developed ideas; well-managed cohesion and paragraphing.
- Band 7.0–7.5: good but with visible limits — sufficient range with some less-common vocabulary; frequent error-free complex sentences BUT errors that clearly persist; clear, organised argument that may lack full development in places.
- Band 5.0–6.0: adequate but limited range; noticeable or frequent errors; ideas underdeveloped, mechanical, or repetitive.

Do NOT cluster essays at Band 7. Band 7 means "good, but with visible limitations." Judge each essay against the descriptors and award what it has earned: a fluent, precise, fully developed essay is a Band 8 or 9, and an essay with persistent errors, narrow vocabulary or thin ideas is a Band 5 or 6. Excellent, competent and weak essays must all end up with clearly different scores. Point to specific evidence from the essay for the band you award.`;
}

/** The reasoning and the four bands. `bandRationale` is never shown to the
 *  student: it is there to make the model commit to a descriptor before it
 *  commits to a number, which is what keeps the two reports in line. */
function scoresSchema(taskType: string, gapCoaching: boolean): string {
  return `  "taskType": "${taskType}",
  "topic": "<2-5 word topic label e.g. 'Technology and Society'>",
  "wordCount": <the word count given with the essay below>,
  "bandRationale": {
    "taskAchievement": "<which band descriptor is fully met and why, citing the essay${gapCoaching ? "; note the next band up and what's missing to reach it" : ''}>",
    "coherenceCohesion": "<same>",
    "lexicalResource": "<same>",
    "grammaticalRangeAccuracy": "<same>"
  },
  "scores": {
    "taskAchievement": <band 4.0-9.0 in 0.5 steps, must match bandRationale.taskAchievement>,
    "coherenceCohesion": <band 4.0-9.0 in 0.5 steps>,
    "lexicalResource": <band 4.0-9.0 in 0.5 steps>,
    "grammaticalRangeAccuracy": <band 4.0-9.0 in 0.5 steps>,
    "overall": <(TA+CC+LR+GRA)/4, IELTS rounding: .25 rounds up to .5, .75 rounds up to next whole band, never round down on .25/.75>
  },`;
}

/** The scoring half of STRICT RULES. */
function scoringRules(): string {
  return `- Score each of the 4 criteria INDEPENDENTLY. It is uncommon for all four to land on the exact same band — most essays are stronger in some areas than others. Do NOT default to giving every criterion 7.0; give matching scores only when each criterion genuinely best-fits that band on its own.
- scores.* must be internally consistent with bandRationale.* — the score must reflect the best-fit band you described
- Award the band the evidence supports, in either direction: give Band 8.0–9.0 when the essay's profile genuinely matches those descriptors, and give Band 4.0–6.0 when it does not. Occasional slips do not block a high band; persistent errors and undeveloped ideas do.
- Do NOT compress scores toward the middle. Never inflate a score to encourage the student, and never deflate one to appear rigorous. This student is preparing for a real exam where a stranger will mark them — a score that is too generous does more harm than one that is too harsh, because it tells them they are ready when they are not. The same applies to the written feedback: name the real weaknesses plainly instead of softening them.`;
}

/**
 * The free weekly report: the same band score as a paid one, and nothing else.
 *
 * It runs the identical preamble, descriptors, scoring method, rationale and
 * scoring rules, so the four criteria and the overall band are reached exactly
 * the way a paid report reaches them. It then stops: no sentence analysis, no
 * vocabulary, no grammar points, no sample answer, no band-gap analysis.
 *
 * Exported for the same reason as buildPrompt, so scripts/compare-band-scores.ts
 * can grade the real free prompt rather than a copy of it.
 */
export function buildLimitedPromptParts(taskType: string): string {
  return `${examinerPreamble()}

=== OFFICIAL BAND DESCRIPTORS (condensed) ===
${bandDescriptors(taskType)}

${scoringMethod()}

Return ONLY this JSON structure, and nothing beyond it:
{
${scoresSchema(taskType, false).replace(/,\s*$/, '')}
}

STRICT RULES:
${scoringRules()}`;
}

// Exported so scripts/compare-band-scores.ts grades against the REAL prompt
// rather than a copy that would drift out of sync with this one.
export function buildPromptParts(taskType: string): string {
  return `${examinerPreamble()}

=== OFFICIAL BAND DESCRIPTORS (condensed) ===
${bandDescriptors(taskType)}

${scoringMethod()}

Return this EXACT JSON structure:
{
${scoresSchema(taskType, true)}
  "feedback": {
    "taskAchievement": {
      "strengths": ["<at least 1 concrete strength, quoting the essay if possible>"],
      "issues": ["<specific issues with examples from the text, tied to the band descriptor gap>"]
    },
    "coherenceCohesion": {
      "strengths": ["<at least 1 concrete strength>"],
      "issues": ["<specific issues>"]
    },
    "lexicalResource": {
      "strengths": ["<at least 1 concrete strength>"],
      "issues": ["<specific issues>"]
    },
    "grammaticalRangeAccuracy": {
      "strengths": ["<at least 1 concrete strength>"],
      "issues": ["<specific issues>"]
    }
  },
  "priorityFixes": [
    "<most impactful fix — specific and actionable>",
    "<second most impactful fix>",
    "<third most impactful fix>"
  ],
  "bandGapAnalysis": "<Specific measurable steps to the next band level>",
  "sampleResponse": "<A band-8/9 model answer for THIS exact question. Task 1: ~150 words — intro paraphrasing the question, an overview of the 2-3 main trends, and the key figures/comparisons. Task 2: ~200 words — intro, 2 body paragraphs (each one main point with a brief example), and a conclusion. Precise academic vocabulary, varied structures, no filler — every sentence carries meaning.>",
  "sentenceAnalysis": [
    {
      "sentence": "<copy the EXACT sentence from the student essay>",
      "type": "<one of: word_choice | grammar | coherence | structure | ok>",
      "feedback": "<specific, actionable feedback for this sentence. If type is ok, write what is good about it>",
      "improved": "<rewrite this exact sentence at band 7-8 level fixing all issues. If type is ok, keep it the same or make minor enhancements>"
    }
  ],
  "vocabulary": [
    {
      "word": "<a high-level, topic-specific word or phrase relevant to THIS essay's topic (band 7+ vocabulary)>",
      "uzbek": "<Uzbek translation>",
      "english": "<clear English definition>",
      "exampleFromEssay": "<example sentence tailored to THIS essay topic>"
    }
  ],
  "grammar": [
    {
      "point": "<an advanced grammar structure useful for high-band IELTS writing>",
      "explanation": "<clear explanation in plain English>",
      "example": "<a correct example sentence>"
    }
  ]
}

STRICT RULES:
- sentenceAnalysis: cover EVERY sentence in the essay, in order
- EXACTLY 15 vocabulary items
- EXACTLY 10 grammar points
- Keep every feedback/strength/issue string to one concise sentence
- Every category MUST have at least 1 strength
- Every issue should reference the essay where possible
${scoringRules()}`;
}

/**
 * A prompt in two halves.
 *
 * `cacheable` is byte-identical for every essay of a given task type, so it is
 * sent with a cache breakpoint and served from Anthropic's prompt cache at ~0.1x
 * input price on a hit. It is ~89% of the request: the band descriptors and the
 * scoring method are the same words every time, and before this split they were
 * re-bought on every report because the student's essay sat in front of them and
 * caching only matches a prefix.
 *
 * `variable` is the student's own question and essay, which is never the same
 * twice and is always billed in full.
 */
export interface PromptParts {
  cacheable: string;
  variable: string;
}

export function limitedPromptParts(
  essay: string, question: string, taskType: string, wordCount: number,
): PromptParts {
  return { cacheable: buildLimitedPromptParts(taskType), variable: essayBlock(essay, question, taskType, wordCount) };
}

export function promptParts(
  essay: string, question: string, taskType: string, wordCount: number,
): PromptParts {
  return { cacheable: buildPromptParts(taskType), variable: essayBlock(essay, question, taskType, wordCount) };
}

/* The joined forms. scripts/compare-band-scores.ts grades these, so it sees the
 * exact text the model sees, in the same order. */
export function buildLimitedPrompt(essay: string, question: string, taskType: string, wordCount: number): string {
  const { cacheable, variable } = limitedPromptParts(essay, question, taskType, wordCount);
  return `${cacheable}\n\n${variable}`;
}

export function buildPrompt(essay: string, question: string, taskType: string, wordCount: number): string {
  const { cacheable, variable } = promptParts(essay, question, taskType, wordCount);
  return `${cacheable}\n\n${variable}`;
}
