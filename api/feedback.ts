import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { createHmac } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const ALLOWED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 12000;
const TOKEN_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes

function verifyToken(raw: string): { uid: string; isBonus: boolean } {
  const secret = process.env.NONCE_SECRET ?? 'fallback-secret-change-in-prod';
  const parts = raw.split('.');
  if (parts.length !== 4) throw new Error('INVALID_TOKEN');
  const [b64uid, bonus, ts, sig] = parts;
  const payload = `${b64uid}.${bonus}.${ts}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (sig !== expected) throw new Error('INVALID_TOKEN');
  if (Date.now() - Number(ts) > TOKEN_MAX_AGE_MS) throw new Error('TOKEN_EXPIRED');
  const uid = Buffer.from(b64uid, 'base64url').toString();
  return { uid, isBonus: bonus === '1' };
}

function initFirebase() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return;
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Reverse the credit that pre-check deducted, so a failed/truncated report
// never costs the user a report from their monthly quota.
async function refundCredit(uid: string, isBonus: boolean): Promise<void> {
  try {
    initFirebase();
    if (!getApps().length) return;
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const data = snap.data()!;
      if (isBonus) {
        const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
        tx.set(userRef, { bonusAnalyses: bonus + 1 }, { merge: true });
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
  if (!essayText || !questionText) {
    return res.status(400).json({ error: 'essayText and questionText are required.' });
  }
  if (!preCheckToken) {
    return res.status(401).json({ error: 'preCheckToken is required. Call /api/pre-check first.' });
  }

  let uid: string;
  let isBonus: boolean;
  try {
    ({ uid, isBonus } = verifyToken(preCheckToken as string));
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'TOKEN_EXPIRED') return res.status(401).json({ error: 'Session expired. Please try again.' });
    return res.status(401).json({ error: 'Invalid session token. Please try again.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Claude API key is not configured.' });

  const resolvedTask = (taskType as string) ?? 'Task 2';
  const wordCount = (essayText as string).trim().split(/\s+/).filter(Boolean).length;

  const anthropic = new Anthropic({ apiKey });
  const prompt = isBonus
    ? buildLimitedPrompt(essayText as string, questionText as string, resolvedTask, wordCount)
    : buildPrompt(essayText as string, questionText as string, resolvedTask, wordCount);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  let raw = '';
  try {
    const stream = await anthropic.messages.stream({
      model: ALLOWED_MODEL,
      max_tokens: isBonus ? 800 : MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        raw += chunk.delta.text;
        res.write(chunk.delta.text);
      }
    }

    res.end();

    // If Claude hit the token cap the streamed JSON is truncated — the client
    // can't parse it and shows "Feedback incomplete". Detect that (and any
    // other unparseable output) and refund the credit so a failed report is
    // never charged against the user's monthly quota.
    let stopReason: string | null = null;
    try { stopReason = (await stream.finalMessage()).stop_reason; } catch { /* ignore */ }
    let clientCanParse = true;
    try {
      JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch { clientCanParse = false; }
    if (stopReason === 'max_tokens' || !clientCanParse) {
      await refundCredit(uid, isBonus);
    }

    // Save report to Firestore (non-blocking, best-effort)
    try {
      initFirebase();
      const feedback = isBonus
        ? parseLimitedResponse(raw, wordCount, resolvedTask)
        : parseResponse(raw, wordCount, resolvedTask);
      const db = getFirestore();
      db.collection('feedback_reports').add({
        uid,
        taskType: feedback.taskType,
        topic: feedback.topic,
        scores: feedback.scores,
        issues: [
          ...(feedback.feedback?.taskAchievement?.issues ?? []),
          ...(feedback.feedback?.coherenceCohesion?.issues ?? []),
          ...(feedback.feedback?.lexicalResource?.issues ?? []),
          ...(feedback.feedback?.grammaticalRangeAccuracy?.issues ?? []),
        ],
        createdAt: FieldValue.serverTimestamp(),
      }).catch(console.error);
    } catch { /* ignore — report saving is non-critical */ }

  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: (err as Error).message ?? 'AI analysis failed. Please try again.' });
    }
  }
}

function bandDescriptors(taskType: string): string {
  const isTask1 = taskType === 'Task 1';
  const minWords = isTask1 ? 150 : 250;

  const taskCriterion = isTask1 ? `TASK ACHIEVEMENT (Task 1 — describing data/process/map):
- Band 9: fully satisfies all requirements; fully developed, accurate overview
- Band 8: covers requirements sufficiently; key features/trends clearly highlighted and appropriately illustrated with data
- Band 7: covers requirements; key features highlighted but not fully extended; overview present
- Band 6: addresses requirements; overview attempted but may be partial/imprecise; some data irrelevant, inaccurate, or missing
- Band 5: task only generally addressed; format may be wrong; NO clear overview; data presented mechanically/as a list
- Band 4: fails to cover key features; no overview; may misidentify the task type` : `TASK RESPONSE (Task 2 — essay):
- Band 9: fully addresses all parts of the prompt; fully extended, well-supported position throughout
- Band 8: sufficiently addresses all parts; well-developed position with relevant, extended, well-supported ideas
- Band 7: addresses all parts; clear position throughout; main ideas extended and supported but may lack full focus in places
- Band 6: addresses all parts (some more than others); position is relevant but conclusions may be unclear/repetitive; main ideas relevant but some underdeveloped
- Band 5: only partially addresses the task; position unclear or inconsistent; ideas limited, repetitive, or hard to identify
- Band 4: responds only minimally or tangentially; position unclear; ideas are few, undeveloped, or largely irrelevant`;

  return `${taskCriterion}
PENALTY: word count below ${minWords} → cap Task Achievement/Response at 6.0 if within 15% under, cap at 5.0 if 15-40% under, cap at 4.0 if more than 40% under.

COHERENCE & COHESION (both tasks):
- Band 9: cohesion used seamlessly; paragraphing skillfully managed
- Band 8: sequences info/ideas logically; cohesion managed well; paragraphing sufficient and appropriate
- Band 7: logical organisation with clear progression; cohesive devices used effectively though may be slightly over/under-used; clear central topic per paragraph
- Band 6: coherent arrangement with overall progression; cohesive devices used but sometimes faulty/mechanical; referencing not always clear; paragraphing present but not always logical
- Band 5: some organisation but no clear overall progression; cohesive devices limited/inaccurate/repetitive; paragraphing absent or inadequate
- Band 4: no clear progression; very basic/repetitive cohesive devices; minimal or no paragraphing

LEXICAL RESOURCE (both tasks):
- Band 9: wide, precise, natural vocabulary range; rare errors only as slips
- Band 8: wide range used fluently and flexibly; occasional inaccuracies in word choice/collocation don't detract
- Band 7: sufficient range for flexibility/precision; some less-common vocabulary attempted; occasional errors in word choice/spelling that don't impede communication
- Band 6: adequate range for the task; attempts less-common vocabulary with some inaccuracy; spelling/word-formation errors that don't impede communication
- Band 5: limited but minimally adequate range; noticeable errors that may cause some difficulty for the reader
- Band 4: limited/inadequate range; frequent errors in word choice may distort meaning

GRAMMATICAL RANGE & ACCURACY (both tasks):
- Band 9: wide range, full flexibility and accuracy; rare errors only as slips
- Band 8: wide range of structures; the great majority of sentences are error-free
- Band 7: a variety of complex structures; frequent error-free sentences; good control, though some errors persist
- Band 6: a mix of simple and complex sentence forms; some grammar/punctuation errors but they rarely impede communication
- Band 5: limited range of structures; complex sentences attempted but less accurately; frequent errors, punctuation may be faulty
- Band 4: very limited range; subordinate structures are rare; errors predominate and may distort meaning`;
}

function buildLimitedPrompt(essay: string, question: string, taskType: string, wordCount: number): string {
  return `You are a certified, experienced IELTS examiner. Score this essay accurately using the official IELTS best-fit method and the band descriptors below. Be fair and calibrated — award high bands (8.0–9.0) to genuinely strong essays and low bands to weak ones. Return ONLY valid JSON — no markdown, no backticks.

TASK TYPE: ${taskType}
QUESTION: ${question}
STUDENT ESSAY (${wordCount} words):
${essay}

=== BAND DESCRIPTORS (condensed) ===
${bandDescriptors(taskType)}

For each criterion, choose the band whose descriptor BEST matches the essay overall (official IELTS best-fit) — cite one concrete reason. Do not demand perfection: the top bands allow minor slips, so a strong, fluent, well-organised essay with wide vocabulary and mostly error-free sentences is a genuine Band 8–9, not a 6. Use the full 4.0–9.0 range; if the essay sits between two bands, pick the closer fit rather than rounding down. Score each of the 4 criteria INDEPENDENTLY — it is uncommon for all four to be the identical band, so do NOT default every criterion to 7.0. These scores must be as accurate as a full paid report.

Return ONLY this JSON structure:
{
  "taskType": "${taskType}",
  "topic": "<2-5 word topic label>",
  "wordCount": ${wordCount},
  "bandRationale": {
    "taskAchievement": "<one short phrase: highest band met and why>"
  },
  "scores": {
    "taskAchievement": <band 4.0-9.0 in 0.5 steps>,
    "coherenceCohesion": <band 4.0-9.0 in 0.5 steps>,
    "lexicalResource": <band 4.0-9.0 in 0.5 steps>,
    "grammaticalRangeAccuracy": <band 4.0-9.0 in 0.5 steps>,
    "overall": <(TA+CC+LR+GRA)/4, IELTS rounding: .25 rounds up to .5, .75 rounds up to next whole band>
  },
  "feedback": {
    "taskAchievement": {
      "strengths": ["<1 concrete strength>"],
      "issues": ["<1 specific issue>"]
    }
  },
  "priorityFixes": [
    "<most important fix — specific and actionable>",
    "<second most important fix>",
    "<third most important fix>"
  ]
}`;
}

function buildPrompt(essay: string, question: string, taskType: string, wordCount: number): string {
  return `You are a certified, experienced IELTS examiner. Score this essay accurately using the official IELTS best-fit method and the band descriptors below — not your own idea of "good writing." Be fair and calibrated: award high bands (8.0–9.0) to genuinely strong essays and low bands to weak ones. Under-scoring a strong essay is just as wrong as over-scoring a weak one. Return ONLY valid JSON — no markdown, no backticks, no extra text.

TASK TYPE: ${taskType}
QUESTION: ${question}
STUDENT ESSAY (${wordCount} words):
${essay}

=== OFFICIAL BAND DESCRIPTORS (condensed) ===
${bandDescriptors(taskType)}

=== SCORING METHOD (official IELTS best-fit) ===
For EACH of the 4 criteria, choose the band whose descriptor BEST matches the essay's overall profile — exactly as a real IELTS examiner does. Best-fit means matching the closest overall description; NOT every feature of a band must be present, and one or two features sitting slightly higher or lower does not change the best-fit band.

Do NOT demand perfection. The top bands explicitly tolerate minor errors: Band 9 allows "rare errors only, as slips"; Band 8 allows "occasional inaccuracies" that don't detract. So a fluent, well-organised essay with a wide, natural vocabulary and mostly error-free complex sentences is a genuine Band 8 or 9 — score it that way. A few small slips must NOT drag such an essay down to Band 5–6.

Use the FULL range 4.0–9.0. Use half bands (e.g. 7.5) when the essay sits between two whole bands; if it does, pick the closer fit — do NOT reflexively round down.

Calibration anchors — score each criterion independently against these:
- Band 9.0: near-native — precise, wide, natural vocabulary; varied structures that are virtually all error-free; fully developed, well-supported ideas; effortless, seamless cohesion. Errors are rare slips only.
- Band 8.0–8.5: fluent and flexible — a wide vocabulary used naturally with only occasional slips; a wide range of structures where the great majority of sentences are error-free; well-developed ideas; well-managed cohesion and paragraphing.
- Band 7.0–7.5: good but with visible limits — sufficient range with some less-common vocabulary; frequent error-free complex sentences BUT errors that clearly persist; clear, organised argument that may lack full development in places.
- Band 5.0–6.0: adequate but limited range; noticeable or frequent errors; ideas underdeveloped, mechanical, or repetitive.

Do NOT cluster essays at Band 7. Band 7 means "good, but with visible limitations." If an essay reads as fluent and natural, uses a wide and precise vocabulary, keeps its complex sentences mostly error-free, and fully develops its ideas, it is a Band 8 or 9 — do NOT cap such an essay at 7. A genuinely excellent essay and a merely competent one must receive clearly different scores. Point to specific evidence from the essay for the band you award.

Return this EXACT JSON structure:
{
  "taskType": "${taskType}",
  "topic": "<2-5 word topic label e.g. 'Technology and Society'>",
  "wordCount": ${wordCount},
  "bandRationale": {
    "taskAchievement": "<which band descriptor is fully met and why, citing the essay; note the next band up and what's missing to reach it>",
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
  },
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
- Score each of the 4 criteria INDEPENDENTLY. It is uncommon for all four to land on the exact same band — most essays are stronger in some areas than others. Do NOT default to giving every criterion 7.0; give matching scores only when each criterion genuinely best-fits that band on its own.
- scores.* must be internally consistent with bandRationale.* — the score must reflect the best-fit band you described
- Award Band 8.0–9.0 whenever the essay's overall profile best matches those descriptors; do NOT withhold a high band just because a few minor slips exist — the top-band descriptors explicitly allow occasional slips
- Do NOT compress scores toward the middle or cluster essays at Band 7 — differentiate genuinely strong essays (8.0–9.0) from merely competent ones (7.0), and do NOT systematically under-award strong essays`;
}

type CategoryFeedback = { strengths: string[]; issues: string[] };
type ParsedFeedback = {
  taskType?: string;
  topic?: string;
  wordCount?: number;
  scores?: Record<string, number>;
  feedback?: {
    taskAchievement?: CategoryFeedback;
    coherenceCohesion?: CategoryFeedback;
    lexicalResource?: CategoryFeedback;
    grammaticalRangeAccuracy?: CategoryFeedback;
  };
  priorityFixes?: string[];
  bandGapAnalysis?: string;
  sampleResponse?: string;
  sentenceAnalysis?: unknown[];
  vocabulary?: unknown[];
  grammar?: unknown[];
  limited?: boolean;
};

// Official IELTS rounding: average of the 4 criteria, with exact .25/.75 ties
// (the only ambiguous cases on a 0.5-increment scale) always rounded UP.
// Computed in code so it's never at the mercy of the model's arithmetic.
function computeOverallBand(ta: number, cc: number, lr: number, gra: number): number {
  const n = [ta, cc, lr, gra].map((s) => Math.round(s * 2)); // each 8-18, exact half-band as an integer
  const sumN = n.reduce((a, b) => a + b, 0); // 32-72
  const r = sumN % 4;
  // nearest integer to sumN/4, with the exact .25/.75 ties (r===2) broken upward
  const nearestInt =
    r === 0 ? sumN / 4 :
    r === 1 ? (sumN - 1) / 4 :
    r === 2 ? (sumN + 2) / 4 :
    (sumN + 1) / 4;
  return nearestInt / 2;
}

function applyOfficialRounding(feedback: ParsedFeedback): ParsedFeedback {
  const s = feedback.scores;
  if (!s) return feedback;
  const { taskAchievement, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy } = s;
  if ([taskAchievement, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy].every((v) => typeof v === 'number')) {
    s.overall = computeOverallBand(taskAchievement, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy);
  }
  return feedback;
}

function parseLimitedResponse(raw: string, wordCount: number, taskType: string): ParsedFeedback {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return applyOfficialRounding({ ...parsed, limited: true });
  } catch {
    return {
      taskType, topic: 'General', wordCount,
      scores: { taskAchievement: 5.5, coherenceCohesion: 5.5, lexicalResource: 5.5, grammaticalRangeAccuracy: 5.5, overall: 5.5 },
      feedback: { taskAchievement: { strengths: ['Essay addresses the task'], issues: ['Could not analyse this attempt — please try again.'] } },
      priorityFixes: ['We could not generate recommendations for this attempt. Please try again.'],
      limited: true,
    };
  }
}

function parseResponse(raw: string, wordCount: number, taskType: string): ParsedFeedback {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return applyOfficialRounding(JSON.parse(cleaned));
  } catch {
    return {
      taskType, topic: 'General', wordCount,
      scores: { taskAchievement: 6.0, coherenceCohesion: 6.0, lexicalResource: 6.0, grammaticalRangeAccuracy: 6.0, overall: 6.0 },
      feedback: {
        taskAchievement: { strengths: ['Essay addresses the task requirements'], issues: ['Unable to parse detailed feedback — please try again'] },
        coherenceCohesion: { strengths: ['Text has an overall structure'], issues: [] },
        lexicalResource: { strengths: ['Vocabulary is appropriate'], issues: [] },
        grammaticalRangeAccuracy: { strengths: ['Ideas are communicated'], issues: [] },
      },
      priorityFixes: ['Please generate a new analysis for detailed recommendations.'],
      bandGapAnalysis: 'Detailed analysis unavailable. Please try again.',
      vocabulary: [],
      grammar: [],
    };
  }
}
