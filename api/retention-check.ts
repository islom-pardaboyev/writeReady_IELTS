import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const adminDb = admin.firestore();

// Gemini 1.5 Flash — update model name when Gemini 3 Flash is GA
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

  const { vocabulary, grammar, topic, idToken } = req.body ?? {};
  if (!idToken || !vocabulary || !grammar) {
    return res.status(400).json({ error: 'Missing required fields: vocabulary, grammar, idToken.' });
  }

  // 1. Verify token
  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  // 2. Check subscription (quiz generation is free for pro users — no monthly credit consumed)
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists) return res.status(403).json({ error: 'User profile not found.' });

  const { plan, subscription, subscriptionExpiresAt } = userSnap.data()!;
  if (!isPlanActive(plan ?? 'free', subscription ?? null, subscriptionExpiresAt ?? null)) {
    return res.status(403).json({ error: 'Pro subscription required to generate retention quizzes.' });
  }

  // 3. Call Gemini Flash (server-side only — key never exposed to client)
  const apiKey = process.env.GOOGLE_GEMINI_FLASH_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Quiz service is not configured.' });
  }

  const prompt = buildQuizPrompt(vocabulary, grammar, topic ?? 'General');

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, body);
      throw new Error(`Gemini API returned ${geminiRes.status}`);
    }

    const data = await geminiRes.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json({ questions: parsed.questions ?? [] });
  } catch (err) {
    console.error('Quiz generation error:', err);
    return res.status(500).json({ error: 'Quiz generation failed. Please try again.' });
  }
}

type VocabItem = { word: string; uzbek: string; english: string };
type GrammarPoint = { point: string; explanation: string; example: string };

function buildQuizPrompt(
  vocabulary: VocabItem[],
  grammar: GrammarPoint[],
  topic: string
): string {
  const vocabList = vocabulary
    .slice(0, 15)
    .map((v, i) => `${i + 1}. "${v.word}" — Uzbek: ${v.uzbek} | English: ${v.english}`)
    .join('\n');

  const grammarList = grammar
    .slice(0, 10)
    .map((g, i) => `${i + 1}. ${g.point}: ${g.explanation}. Example: "${g.example}"`)
    .join('\n');

  return `Generate a retention quiz for an IELTS student studying the topic: "${topic}".
Return ONLY valid JSON — no markdown, no backticks.

VOCABULARY TO TEST:
${vocabList}

GRAMMAR POINTS TO TEST:
${grammarList}

Return this exact JSON:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple-choice",
      "question": "<clear, specific question>",
      "options": ["A. <option>", "B. <option>", "C. <option>", "D. <option>"],
      "correctAnswer": "<exact text of correct option, e.g. 'B. profound'>",
      "itemRef": "<the word or grammar point being tested>"
    }
  ]
}

Generate exactly 10 questions:
- 6 vocabulary questions: test meaning, Uzbek translation, usage in context, synonyms
- 4 grammar questions: test applying the rule, identifying correct/incorrect usage
- Each question must have exactly 4 options labeled A through D
- correctAnswer must be the EXACT text of one of the options (including the letter prefix)
- Make questions varied — avoid repeating the same question format
- Questions should test understanding and application, not just rote recall`;
}
