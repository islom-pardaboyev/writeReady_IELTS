import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

const CENTER_MONTHLY_LIMIT = 15;
const ALLOWED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;

type CreditErrorCode = 'USER_NOT_FOUND' | 'NOT_PRO' | 'LIMIT_REACHED';
class CreditError extends Error {
  constructor(public code: CreditErrorCode) { super(code); }
}

function initFirebase() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Missing Firebase env vars. Got: projectId=${!!projectId}, clientEmail=${!!clientEmail}, privateKey=${!!privateKey}`
    );
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}


async function getUid(req: VercelRequest): Promise<string> {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('MISSING_TOKEN');
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

async function consumeCredit(uid: string, monthKey: string): Promise<{ userRef: DocumentReference; isBonus: boolean }> {
  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  let isBonus = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new CreditError('USER_NOT_FOUND');

    const data = snap.data()!;

    // Bonus analyses (free preview) — limited report
    const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
    if (bonus > 0) {
      tx.set(userRef, { bonusAnalyses: bonus - 1 }, { merge: true });
      isBonus = true;
      return;
    }

    // Check if user is in an active learning center
    const userEmail: string = data.email ?? '';
    if (userEmail) {
      const centersSnap = await db.collection('learningCenters')
        .where('status', '==', 'active')
        .get();

      for (const centerDoc of centersSnap.docs) {
        const centerData = centerDoc.data();
        if (centerData.expiresAt && new Date(centerData.expiresAt) < new Date()) continue;

        const studentSnap = await centerDoc.ref.collection('students')
          .where('email', '==', userEmail)
          .limit(1)
          .get();

        if (!studentSnap.empty) {
          const usage = data.usage ?? {};
          const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
          if (used >= CENTER_MONTHLY_LIMIT) throw new CreditError('LIMIT_REACHED');
          tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
          return;
        }
      }
    }

    const planLimits: Record<string, number> = { forever: 9999, premium: 30, standard: 12, basic: 5 };
    const monthlyLimit = planLimits[data.plan as string];
    if (!monthlyLimit) throw new CreditError('NOT_PRO'); // free plan, no bonus left

    const usage = data.usage ?? {};
    const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
    if (used >= monthlyLimit) throw new CreditError('LIMIT_REACHED');

    tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
  });

  return { userRef, isBonus };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    initFirebase();
  } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Invalid or missing auth token. Please sign in again.' });
  }

  const { essayText, questionText, taskType } = req.body ?? {};
  if (!essayText || !questionText) {
    return res.status(400).json({ error: 'essayText and questionText are required.' });
  }

  const monthKey = currentMonthKey();
  let userRef: DocumentReference;
  let isBonus = false;

  try {
    ({ userRef, isBonus } = await consumeCredit(uid, monthKey));
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      if (e.code === 'NOT_PRO') return res.status(403).json({ error: 'AI feedback requires a paid plan (Basic, Standard, Premium, or Lifetime).' });
      if (e.code === 'LIMIT_REACHED') return res.status(429).json({ error: 'Monthly analysis limit reached. Quota resets next month.' });
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
    }
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Claude API key is not configured.' });

  const resolvedTask = (taskType as string) ?? 'Task 2';
  const wordCount = (essayText as string).trim().split(/\s+/).filter(Boolean).length;

  try {
    const anthropic = new Anthropic({ apiKey });
    const prompt = isBonus
      ? buildLimitedPrompt(essayText as string, questionText as string, resolvedTask, wordCount)
      : buildPrompt(essayText as string, questionText as string, resolvedTask, wordCount);
    const message = await anthropic.messages.create({
      model: ALLOWED_MODEL,
      max_tokens: isBonus ? 800 : MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
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

    return res.status(200).json({ feedback, limited: isBonus });
  } catch (err) {
    await userRef.set({ usage: { monthKey, count: FieldValue.increment(-1) } }, { merge: true }).catch(console.error);
    return res.status(500).json({ error: (err as Error).message ?? 'AI analysis failed. Please try again.' });
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

function parseLimitedResponse(raw: string, wordCount: number, taskType: string): ParsedFeedback {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { ...parsed, limited: true };
  } catch {
    return {
      taskType,
      topic: 'General',
      wordCount,
      scores: { taskAchievement: 5.5, coherenceCohesion: 5.5, lexicalResource: 5.5, grammaticalRangeAccuracy: 5.5, overall: 5.5 },
      feedback: {
        taskAchievement: { strengths: ['Essay addresses the task'], issues: ['See full analysis by upgrading'] },
      },
      priorityFixes: ['Upgrade to see detailed recommendations.'],
      limited: true,
    };
  }
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
  "sampleResponse": "<A high-band (band 7-8) model response for THIS exact question — 2-3 paragraphs showing correct structure, vocabulary, and grammar. For Task 1 describe the data clearly; for Task 2 argue both sides or one side with evidence. Without any fancy words etc that make the writing longer without any meaning. You may effective collocations that are related to the topic.>",
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

function parseResponse(raw: string, wordCount: number, taskType: string): ParsedFeedback {
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
