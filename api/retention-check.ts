import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

  const { vocabulary, grammar, topic } = req.body ?? {};
  if (!vocabulary || !grammar) {
    return res.status(400).json({ error: 'vocabulary and grammar are required.' });
  }

  // Verify subscription (quiz does not consume monthly credit)
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return res.status(404).json({ error: 'User profile not found.' });

  if (!isProUser(userSnap.data()!.subscription)) {
    return res.status(403).json({ error: 'Pro subscription required to generate retention quizzes.' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_FLASH_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Quiz service is not configured.' });

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildQuizPrompt(vocabulary, grammar, topic ?? 'General') }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, body);
      throw new Error(`Gemini API returned ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json() as {
      candidates?: { content: { parts: { text: string }[] } }[];
    };
    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { questions?: unknown[] };

    return res.status(200).json({ questions: parsed.questions ?? [] });
  } catch (err) {
    console.error('Quiz generation error:', err);
    return res.status(500).json({ error: 'Quiz generation failed. Please try again.' });
  }
}

type VocabItem = { word: string; uzbek: string; english: string };
type GrammarPoint = { point: string; explanation: string; example: string };

function buildQuizPrompt(vocabulary: VocabItem[], grammar: GrammarPoint[], topic: string): string {
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
- 6 vocabulary questions: meaning, Uzbek translation, usage in context, synonyms
- 4 grammar questions: applying the rule, identifying correct/incorrect usage
- Each question must have exactly 4 options labeled A through D
- correctAnswer must be the EXACT text of one of the options (including letter prefix)`;
}
