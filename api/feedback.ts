import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { createHmac } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const ALLOWED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;
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

For each criterion, choose the band whose descriptor BEST matches the essay overall (official IELTS best-fit) — cite one concrete reason. Do not demand perfection: the top bands allow minor slips, so a strong, fluent, well-organised essay with wide vocabulary and mostly error-free sentences is a genuine Band 8–9, not a 6. Use the full 4.0–9.0 range; if the essay sits between two bands, pick the closer fit rather than rounding down.

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
  "priorityFixes": ["<most important fix>"]
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

Calibration anchors:
- Band 8.5–9.0: reads like a highly competent, near-native writer — precise, wide vocabulary; varied, virtually error-free complex sentences; fully developed, well-supported ideas; seamless cohesion and paragraphing.
- Band 7.0–7.5: good control and range; some less-common vocabulary; frequent error-free complex sentences with only minor errors; clear, well-organised argument that addresses all parts.
- Band 5.0–6.0: adequate but limited range; noticeable or frequent errors; ideas underdeveloped, mechanical, or repetitive.
Point to specific evidence from the essay for the band you award.

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
  "sampleResponse": "<A high-band (band 7-9) model response for THIS exact question. STRICT REQUIREMENTS: (1) For Task 1: write a FULL essay of at least 180 words covering ALL key data points, trends, comparisons, and figures shown in the chart/graph/diagram — include an introduction paraphrasing the question, an overview paragraph highlighting 2-3 main trends, and 2 detailed body paragraphs with specific data and figures. Do NOT omit any significant data. (2) For Task 2: write a FULL essay of at least 280 words with introduction, 2-3 body paragraphs each with a main point, supporting explanation and example, and a conclusion. Use precise academic vocabulary, varied sentence structures, and effective cohesive devices. Do NOT add filler words — every sentence must carry meaning. Write as a band 7-9 IELTS candidate would.>",
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
      "word": "<word or phrase from the essay or relevant to the topic>",
      "uzbek": "<Uzbek translation>",
      "english": "<clear English definition>",
      "exampleFromEssay": "<example sentence tailored to THIS essay topic>"
    }
  ],
  "grammar": [
    {
      "point": "<grammar rule name>",
      "explanation": "<clear explanation in plain English>",
      "example": "<a correct example sentence>"
    }
  ]
}

STRICT RULES:
- sentenceAnalysis: pick the sentences that most need improvement plus 2-3 strong ones as positive examples — up to 12 sentences total, in the order they appear. Do NOT analyse every single sentence.
- EXACTLY 10 vocabulary items
- EXACTLY 6 grammar points
- Keep every feedback/strength/issue string to one concise sentence
- Every category MUST have at least 1 strength
- Every issue should reference the essay where possible
- scores.* must be internally consistent with bandRationale.* — the score must reflect the best-fit band you described
- Award Band 8.0–9.0 whenever the essay's overall profile best matches those descriptors; do NOT withhold a high band just because a few minor slips exist — the top-band descriptors explicitly allow occasional slips
- Do NOT compress scores toward the middle, and do NOT systematically under-award strong essays`;
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
      feedback: { taskAchievement: { strengths: ['Essay addresses the task'], issues: ['See full analysis by upgrading'] } },
      priorityFixes: ['Upgrade to see detailed recommendations.'],
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
