import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const MONTHLY_LIMIT = 12;
const ALLOWED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;

type CreditErrorCode = 'USER_NOT_FOUND' | 'NOT_PRO' | 'LIMIT_REACHED';
class CreditError extends Error {
  constructor(public code: CreditErrorCode) { super(code); }
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isProUser(subscription: unknown): boolean {
  if (subscription === 'forever') return true;
  if (typeof subscription !== 'string') return false;
  const expiry = new Date(subscription);
  return !Number.isNaN(expiry.getTime()) && expiry > new Date();
}

async function getUid(req: VercelRequest): Promise<string> {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('MISSING_TOKEN');
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Invalid or missing auth token. Please sign in again.' });
  }

  const { essayText, questionText, taskType } = req.body ?? {};
  if (!essayText || !questionText) {
    return res.status(400).json({ error: 'essayText and questionText are required.' });
  }

  const monthKey = currentMonthKey();
  const userRef = db.collection('users').doc(uid);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new CreditError('USER_NOT_FOUND');

      const data = snap.data()!;
      if (!isProUser(data.subscription)) throw new CreditError('NOT_PRO');

      const usage = data.usage ?? {};
      const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
      if (used >= MONTHLY_LIMIT) throw new CreditError('LIMIT_REACHED');

      tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
    });
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      if (e.code === 'NOT_PRO') return res.status(403).json({ error: 'AI feedback requires a Pro or Lifetime plan.' });
      if (e.code === 'LIMIT_REACHED') return res.status(429).json({ error: 'Monthly analysis limit reached. Quota resets next month.' });
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
    }
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Claude API key is not configured.' });

  const resolvedTask = (taskType as string) ?? 'Task 2';
  const wordCount = (essayText as string).trim().split(/\s+/).filter(Boolean).length;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ALLOWED_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(essayText as string, questionText as string, resolvedTask, wordCount) }],
      }),
    });

    const claudeData = await claudeRes.json() as {
      content?: { type: string; text: string }[];
      error?: { message: string };
    };

    if (!claudeRes.ok) {
      await userRef.set({ usage: { monthKey, count: admin.firestore.FieldValue.increment(-1) } }, { merge: true }).catch(console.error);
      return res.status(claudeRes.status).json({ error: claudeData.error?.message ?? 'Claude API error.' });
    }

    const raw = claudeData.content?.[0]?.type === 'text' ? claudeData.content[0].text : '';
    const feedback = parseResponse(raw, wordCount, resolvedTask);

    // Save issues for recurring error-pattern tracking (non-blocking)
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(console.error);

    return res.status(200).json({ feedback });
  } catch (err) {
    await userRef.set({ usage: { monthKey, count: admin.firestore.FieldValue.increment(-1) } }, { merge: true }).catch(console.error);
    return res.status(500).json({ error: (err as Error).message ?? 'AI analysis failed. Please try again.' });
  }
}

function buildPrompt(essay: string, question: string, taskType: string, wordCount: number): string {
  return `You are a professional IELTS examiner with 10+ years of experience. Analyze this student essay using official IELTS band descriptors. Return ONLY valid JSON — no markdown, no backticks, no extra text.

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
- EXACTLY 15 vocabulary items
- EXACTLY 10 grammar points
- Every category MUST have at least 1 strength
- Band scores are realistic: most students score 5.0-7.0; 8.0+ is very rare
- Overall = simple average of the 4 criteria scores rounded to nearest 0.5`;
}

function parseResponse(raw: string, wordCount: number, taskType: string): Record<string, unknown> & {
  feedback?: { taskAchievement?: { issues?: string[] }; coherenceCohesion?: { issues?: string[] }; lexicalResource?: { issues?: string[] }; grammaticalRangeAccuracy?: { issues?: string[] } };
  taskType?: string; topic?: string; scores?: unknown;
} {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      taskType,
      topic: 'General',
      wordCount,
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
