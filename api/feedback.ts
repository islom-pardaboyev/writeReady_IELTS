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

function buildLimitedPrompt(essay: string, question: string, taskType: string, wordCount: number): string {
  return `You are a professional IELTS examiner. Score this student essay. Return ONLY valid JSON — no markdown, no backticks.

TASK TYPE: ${taskType}
QUESTION: ${question}
STUDENT ESSAY (${wordCount} words):
${essay}

Return ONLY this JSON structure:
{
  "taskType": "${taskType}",
  "topic": "<2-5 word topic label>",
  "wordCount": ${wordCount},
  "scores": {
    "taskAchievement": <band 4.0-9.0 in 0.5 steps>,
    "coherenceCohesion": <band 4.0-9.0 in 0.5 steps>,
    "lexicalResource": <band 4.0-9.0 in 0.5 steps>,
    "grammaticalRangeAccuracy": <band 4.0-9.0 in 0.5 steps>,
    "overall": <average rounded to nearest 0.5>
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
  return `You are a professional IELTS examiner with 10+ years of experience. Analyze this student essay using official IELTS band descriptors. Return ONLY valid JSON — no markdown, no backticks, no extra text. Be generous and honest while assessing the reports.

TASK TYPE: ${taskType}
QUESTION: ${question}
STUDENT ESSAY (${wordCount} words):
${essay}

Return this EXACT JSON structure:
{
  "taskType": "${taskType}",
  "topic": "<2-5 word topic label e.g. 'Technology and Society'>",
  "wordCount": ${wordCount},
  "scores": {
    "taskAchievement": <band 4.0-9.0 in 0.5 steps>,
    "coherenceCohesion": <band 4.0-9.0 in 0.5 steps>,
    "lexicalResource": <band 4.0-9.0 in 0.5 steps>,
    "grammaticalRangeAccuracy": <band 4.0-9.0 in 0.5 steps>,
    "overall": <average rounded to nearest 0.5>
  },
  "feedback": {
    "taskAchievement": {
      "strengths": ["<at least 1 concrete strength, quoting the essay if possible>"],
      "issues": ["<specific issues with examples from the text>"]
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
- sentenceAnalysis: cover EVERY sentence in the essay, in order
- EXACTLY 15 vocabulary items
- EXACTLY 10 grammar points
- Every category MUST have at least 1 strength
- Band scores are realistic: most students score 5.0-7.0; 8.0+ is very rare
- Overall = simple average of the 4 criteria scores rounded to nearest 0.5`;
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

function parseLimitedResponse(raw: string, wordCount: number, taskType: string): ParsedFeedback {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { ...parsed, limited: true };
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
    return JSON.parse(cleaned);
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
