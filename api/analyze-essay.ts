import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK once (cold start singleton)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}'
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const adminDb = admin.firestore();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isPlanActive(plan: string, expiresAt: admin.firestore.Timestamp | null): boolean {
  if (plan === 'forever') return true;
  if (plan === 'pro') {
    if (!expiresAt) return true;
    return expiresAt.toDate() > new Date();
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { essayText, questionText, mode, idToken } = req.body ?? {};

  if (!idToken || !essayText || !questionText) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Step 1: Verify Firebase ID token
  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  // Step 2: Look up user plan in Firestore
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    return res.status(403).json({ error: 'User profile not found.' });
  }

  const userData = userSnap.data()!;
  const { plan, subscriptionExpiresAt } = userData;

  if (plan === 'free') {
    return res.status(403).json({ error: 'AI feedback requires a Pro or Lifetime plan. Upgrade to continue.' });
  }

  if (!isPlanActive(plan, subscriptionExpiresAt ?? null)) {
    return res.status(403).json({ error: 'Your Pro subscription has expired. Please renew to continue.' });
  }

  // Step 3: Check and atomically increment usage
  const yearMonth = currentYearMonth();
  const usageRef = adminDb.collection('usage').doc(`${uid}_${yearMonth}`);

  try {
    await adminDb.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const MONTHLY_LIMIT = 12;

      if (!usageSnap.exists) {
        tx.set(usageRef, {
          uid,
          yearMonth,
          count: 1,
          limit: MONTHLY_LIMIT,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      const { count } = usageSnap.data()!;
      if (count >= MONTHLY_LIMIT) {
        throw Object.assign(new Error('Monthly limit reached.'), { code: 'LIMIT_REACHED' });
      }

      tx.update(usageRef, {
        count: count + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'LIMIT_REACHED') {
      return res.status(429).json({ error: 'Monthly analysis limit reached. Your quota resets at the start of next month.' });
    }
    console.error('Transaction error:', err);
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  // Step 4: Call Claude API
  const prompt = buildPrompt(essayText, questionText, mode);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const feedback = parseClaudeResponse(raw, essayText);

    return res.status(200).json({ feedback });
  } catch (err) {
    console.error('Claude API error:', err);
    // Roll back the usage count since analysis failed
    await adminDb.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      if (usageSnap.exists) {
        const { count } = usageSnap.data()!;
        if (count > 0) {
          tx.update(usageRef, {
            count: count - 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });
    return res.status(500).json({ error: 'AI analysis failed. Your usage count has not been charged. Please try again.' });
  }
}

function buildPrompt(essay: string, question: string, mode: string): string {
  return `You are an expert IELTS examiner and writing coach. Analyze the following IELTS essay and return structured feedback in JSON format.

QUESTION:
${question}

STUDENT ESSAY:
${essay}

PRACTICE MODE: ${mode}

Return ONLY valid JSON (no markdown, no backticks) in exactly this structure:
{
  "sentenceFeedback": [
    {
      "sentence": "1",
      "original": "<exact sentence from essay>",
      "correction": "<corrected version or null>",
      "explanation": "<brief explanation in English or null>",
      "type": "<'grammar' | 'coherence' | 'style' | 'ok'>"
    }
  ],
  "vocabUpgrades": [
    {
      "word": "<simpler word used in the essay>",
      "uzbekMeaning": "<Uzbek translation>",
      "englishMeaning": "<English definition>",
      "exampleSentence": "<strong example sentence using a better alternative>"
    }
  ],
  "taskAchievementNotes": "<2-3 sentences on how well the task was addressed>",
  "overallSummary": "<2-3 sentence overall assessment including strengths and main areas for improvement>",
  "bandEstimate": <number between 4.0 and 9.0, increments of 0.5>,
  "modelParagraph": "<a polished 1-2 paragraph model response demonstrating stronger writing>"
}

Rules:
- Split the essay into individual sentences for sentenceFeedback
- Mark type 'ok' for correct sentences (no correction/explanation needed)
- Mark type 'grammar' for grammatical errors (wrong tense, subject-verb agreement, article use, etc.)
- Mark type 'coherence' for unclear or poorly connected ideas
- Mark type 'style' for register/tone issues
- For vocabUpgrades: identify 4-6 common/weak words that could be upgraded; provide O'zbek meanings
- Keep corrections concise — not a lecture, just the fix and a brief why
- The modelParagraph should be 150-250 words demonstrating sophisticated academic writing
- Band estimate should be realistic (most learners score 5.0-7.0)`;
}

function parseClaudeResponse(raw: string, essayText: string) {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: return basic structure if JSON parsing fails
    const sentences = essayText.match(/[^.!?]+[.!?]+/g) ?? [essayText];
    return {
      sentenceFeedback: sentences.slice(0, 5).map((s) => ({
        sentence: '1',
        original: s.trim(),
        correction: null,
        explanation: null,
        type: 'ok',
      })),
      vocabUpgrades: [],
      taskAchievementNotes: 'Unable to parse detailed feedback. Please try again.',
      overallSummary: raw.slice(0, 300),
      bandEstimate: 6.0,
      modelParagraph: '',
    };
  }
}
