import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function initFirebase() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Missing Firebase env vars.`);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
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
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Invalid or missing auth token.' });
  }

  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return res.status(404).json({ error: 'User profile not found.' });
  if (!isProUser(userSnap.data()!.subscription)) {
    return res.status(403).json({ error: 'Pro subscription required.' });
  }

  const { userSentence, targetItem, targetType, example } = req.body ?? {};
  if (!userSentence || !targetItem || !targetType) {
    return res.status(400).json({ error: 'userSentence, targetItem, and targetType are required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_FLASH_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured.' });

  const prompt = buildPrompt(userSentence as string, targetItem as string, targetType as string, example as string | undefined);

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      }),
    });

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      throw new Error(`Gemini API returned ${geminiRes.status}: ${body.slice(0, 200)}`);
    }

    const data = await geminiRes.json() as {
      candidates?: { content: { parts: { text: string }[] } }[];
    };
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract JSON — handle markdown code fences and leading/trailing text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON found in Gemini response: ${raw.slice(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]) as {
      score: number | string;
      correct: boolean | string;
      feedback: string;
      improved: string;
    };

    return res.status(200).json({
      score: Number(parsed.score) || 0,
      correct: parsed.correct === true || parsed.correct === 'true',
      feedback: parsed.feedback ?? '',
      improved: parsed.improved ?? '',
    });
  } catch (err) {
    console.error('check-practice error:', err);
    return res.status(500).json({
      score: 0,
      correct: false,
      feedback: `Evaluation failed: ${(err as Error).message}`,
      improved: '',
    });
  }
}

function buildPrompt(userSentence: string, targetItem: string, targetType: string, example?: string): string {
  const context = targetType === 'vocab'
    ? `The student is practising the vocabulary word/phrase: "${targetItem}".`
    : `The student is practising the grammar rule: "${targetItem}".`;
  const exampleNote = example ? `\nA correct example sentence: "${example}"` : '';

  return `You are an IELTS writing tutor. Evaluate the student's sentence.
${context}${exampleNote}

Student's sentence: "${userSentence}"

Return ONLY valid JSON — no markdown, no backticks:
{
  "correct": <true if the target word/rule is used correctly, otherwise false>,
  "score": <integer 0-100 reflecting correctness and quality>,
  "feedback": "<1-2 sentences: explain what is right or wrong about how they used '${targetItem}'>",
  "improved": "<an improved version of their sentence at IELTS band 7 level, keeping their original meaning>"
}`;
}
