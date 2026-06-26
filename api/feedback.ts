import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const adminDb = admin.firestore();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isPlanActive(
  plan: string,
  subscription: string | null,
  subscriptionExpiresAt: admin.firestore.Timestamp | null
): boolean {
  if (plan === 'forever' || subscription === 'forever') return true;
  if (plan === 'pro') {
    if (subscription && new Date(subscription) > new Date()) return true;
    if (!subscriptionExpiresAt) return true;
    return subscriptionExpiresAt.toDate() > new Date();
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { essayText, questionText, taskType, idToken } = req.body ?? {};
  if (!idToken || !essayText || !questionText) {
    return res.status(400).json({ error: 'Missing required fields: essayText, questionText, idToken.' });
  }

  // 1. Verify Firebase ID token
  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  // 2. Check user plan
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists) return res.status(403).json({ error: 'User profile not found.' });

  const { plan, subscription, subscriptionExpiresAt } = userSnap.data()!;
  if (!isPlanActive(plan ?? 'free', subscription ?? null, subscriptionExpiresAt ?? null)) {
    return res.status(403).json({
      error: plan === 'free'
        ? 'AI feedback requires a Pro or Lifetime plan. Upgrade to continue.'
        : 'Your subscription has expired. Please renew to continue.',
    });
  }

  // 3. Atomically increment usage
  const yearMonth = currentYearMonth();
  const usageRef = adminDb.collection('usage').doc(`${uid}_${yearMonth}`);

  try {
    await adminDb.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const MONTHLY_LIMIT = 12;
      if (!usageSnap.exists) {
        tx.set(usageRef, { uid, yearMonth, count: 1, limit: MONTHLY_LIMIT, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
      }
      const { count } = usageSnap.data()!;
      if (count >= MONTHLY_LIMIT) throw Object.assign(new Error('Limit'), { code: 'LIMIT_REACHED' });
      tx.update(usageRef, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'LIMIT_REACHED') {
      return res.status(429).json({ error: 'Monthly analysis limit reached. Your quota resets at the start of next month.' });
    }
    console.error('Transaction error:', err);
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  // 4. Call Claude API
  const resolvedTaskType: string = taskType ?? 'Task 2';

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: buildPrompt(essayText, questionText, resolvedTaskType) }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const feedback = parseResponse(raw, essayText, resolvedTaskType);

    // 5. Save issues to Firestore for error-pattern tracking (client queries this)
    await adminDb.collection('feedback_reports').add({
      uid,
      taskType: feedback.taskType,
      topic: feedback.topic,
      scores: feedback.scores,
      issues: [
        ...((feedback.feedback as { taskAchievement?: { issues?: string[] } })?.taskAchievement?.issues ?? []),
        ...((feedback.feedback as { coherenceCohesion?: { issues?: string[] } })?.coherenceCohesion?.issues ?? []),
        ...((feedback.feedback as { lexicalResource?: { issues?: string[] } })?.lexicalResource?.issues ?? []),
        ...((feedback.feedback as { grammaticalRangeAccuracy?: { issues?: string[] } })?.grammaticalRangeAccuracy?.issues ?? []),
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ feedback });
  } catch (err) {
    console.error('Claude API error:', err);
    // Roll back usage count
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      if (snap.exists) {
        const { count } = snap.data()!;
        if (count > 0) tx.update(usageRef, { count: count - 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }).catch(console.error);
    return res.status(500).json({ error: 'AI analysis failed. Your usage count has not been charged. Please try again.' });
  }
}

function buildPrompt(essay: string, question: string, taskType: string): string {
  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
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
    "<most impactful fix — specific and actionable, e.g. 'Replace weak verbs (get/make/do) with precise academic alternatives (facilitate/demonstrate/implement)'>",
    "<second most impactful fix>",
    "<third most impactful fix>"
  ],
  "bandGapAnalysis": "<Specific measurable steps to the next band level. E.g.: To move from Band 6.0 to Band 6.5: (1) Add discourse markers (Furthermore, Consequently, Nevertheless) between paragraphs. (2) Vary sentence starters beyond Subject+Verb. (3) Eliminate repeated vocabulary by using 2-3 synonyms for key terms.>",
  "vocabulary": [
    {
      "word": "<word or phrase from the essay or relevant to the topic>",
      "uzbek": "<Uzbek translation>",
      "english": "<clear English definition>",
      "exampleFromEssay": "<a new example sentence using this word specifically about this essay's topic — NOT a generic example>"
    }
  ],
  "grammar": [
    {
      "point": "<grammar rule name e.g. 'Subject-verb agreement with collective nouns'>",
      "explanation": "<clear explanation of the rule in plain English>",
      "example": "<a correct example sentence>"
    }
  ]
}

STRICT RULES:
- EXACTLY 15 vocabulary items: mix of words from the essay + high-value IELTS academic vocabulary for this topic
- EXACTLY 10 grammar points: issues found in this essay + advanced patterns the student should use
- Every category MUST have at least 1 strength — do not only list problems
- priorityFixes: the 3 changes with the HIGHEST impact on the band score
- bandGapAnalysis: be specific and measurable, not generic platitudes
- Band scores are realistic: most students score 5.0-7.0; 8.0+ is very rare
- Overall = simple average of the 4 criteria scores rounded to nearest 0.5`;
}

function parseResponse(raw: string, essay: string, taskType: string): Record<string, unknown> {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
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
      bandGapAnalysis: 'Detailed band gap analysis unavailable. Please try again.',
      vocabulary: [],
      grammar: [],
    };
  }
}
