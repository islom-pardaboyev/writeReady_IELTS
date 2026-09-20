import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { initFirebase, getUid, currentDayKey, resolvePaidStatus } from './_lib/shared.js';

const ALLOWED_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 512;

// Practice checks are cheap (Haiku, 512-token answers — roughly 13 som each,
// about 1/50th of an essay report), so this cap is here to bound a runaway
// loop or a scripted client, not to ration normal study. At 30/day the very
// worst a single account can cost in a month is ~11,700 som, which every paid
// plan absorbs. Raise it freely if real usage ever gets close.
const DAILY_PRACTICE_LIMIT = 30;

type PracticeErrorCode = 'USER_NOT_FOUND' | 'NOT_PAID' | 'DAILY_LIMIT';
class PracticeError extends Error {
  constructor(public code: PracticeErrorCode) { super(code); }
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
  const userRef = db.collection('users').doc(uid);
  const dayKey = currentDayKey();

  // Gate and meter together in one transaction — two tabs firing at once would
  // otherwise both read the same count and both be allowed through.
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new PracticeError('USER_NOT_FOUND');

      const data = snap.data()!;
      if (!resolvePaidStatus(data).isPaid) throw new PracticeError('NOT_PAID');

      const practice = (data.practiceUsage ?? {}) as { dayKey?: string; count?: number };
      const used = practice.dayKey === dayKey ? (practice.count ?? 0) : 0;
      if (used >= DAILY_PRACTICE_LIMIT) throw new PracticeError('DAILY_LIMIT');

      tx.set(userRef, { practiceUsage: { dayKey, count: used + 1 } }, { merge: true });
    });
  } catch (e: unknown) {
    if (e instanceof PracticeError) {
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
      if (e.code === 'NOT_PAID') return res.status(403).json({ error: 'Practice checking is part of a paid plan. Upgrade to Basic, Standard or Premium to use it.' });
      return res.status(429).json({ error: `You have used all ${DAILY_PRACTICE_LIMIT} practice checks for today. They reset tomorrow.` });
    }
    console.error('check-practice gate error:', e);
    return res.status(500).json({ error: 'Could not check your usage. Please try again.' });
  }

  const { userSentence, targetItem, targetType, example } = req.body ?? {};
  if (!userSentence || !targetItem || !targetType) {
    await refundPracticeCheck(userRef, dayKey);
    return res.status(400).json({ error: 'userSentence, targetItem, and targetType are required.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await refundPracticeCheck(userRef, dayKey);
    return res.status(500).json({ error: 'Claude API key is not configured.' });
  }

  const prompt = buildPrompt(userSentence as string, targetItem as string, targetType as string, example as string | undefined);

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: ALLOWED_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON found in response: ${raw.slice(0, 200)}`);

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
    // The check was counted before the call. Give it back — a failed check is
    // never the student's fault and must not eat their daily allowance.
    console.error('check-practice error:', err);
    await refundPracticeCheck(userRef, dayKey);
    return res.status(500).json({
      score: 0,
      correct: false,
      feedback: `Evaluation failed: ${(err as Error).message}`,
      improved: '',
    });
  }
}

/** Hand back one daily practice check after a failure. Never throws — a
 *  refund that fails must not turn into a second error for the student. */
async function refundPracticeCheck(
  userRef: FirebaseFirestore.DocumentReference,
  dayKey: string,
): Promise<void> {
  try {
    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const practice = (snap.data()!.practiceUsage ?? {}) as { dayKey?: string; count?: number };
      // Only refund within the same day — after midnight the counter has reset
      // and decrementing it would hand out a free extra check.
      if (practice.dayKey !== dayKey) return;
      tx.set(userRef, { practiceUsage: { dayKey, count: Math.max(0, (practice.count ?? 1) - 1) } }, { merge: true });
    });
  } catch (e) {
    console.error('check-practice refund failed:', e);
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
