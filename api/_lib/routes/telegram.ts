import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebase } from '../shared.js';
import { extractJson, normalizeScores } from '../bandScore.js';
import { essaySignature, loadSavedReport } from '../savedReports.js';
import { ensureWebhook, handleUpdate, MISTAKES_INSTRUCTION, type BotDeps, type Marked, type TgUpdate } from '../studentBot.js';
import { webhookSecret } from '../telegramApi.js';
import { startMarking, storeReport } from '../../feedback.js';

/**
 * The student Telegram bot's webhook. Telegram posts every message and button
 * press here; the bot itself is api/_lib/studentBot.ts.
 */

/**
 * The bands, topic and mistakes in the AI's reply. Throws when there are no
 * real scores, which the bot treats as a failed check and gives back.
 * Exported for scripts/test-student-bot.ts.
 */
export function readCheck(raw: string): Marked {
  const parsed = extractJson(raw) as Record<string, unknown>;
  const scores = normalizeScores(parsed?.scores);
  if (!scores) throw new Error('the reply had no scores');
  const topic = typeof parsed.topic === 'string' && parsed.topic.trim() ? parsed.topic.trim().slice(0, 80) : 'General';
  const mistakes = Array.isArray(parsed.topMistakes)
    ? parsed.topMistakes
      .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
      .slice(0, 3)
      .map((m) => m.trim().slice(0, 300))
    : [];
  return { scores, topic, mistakes, raw };
}

const deps: BotDeps = {
  // The free weekly report's marking, exactly as the site asks for it, plus
  // the bot's short list of mistakes after the essay.
  async mark({ question, essay, wordCount, lock }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    const message = await startMarking(new Anthropic({ apiKey }), {
      essayText: essay,
      questionText: question,
      taskType: 'Task 2',
      wordCount,
      scoreOnly: true,
      consistency: lock ? { kind: 'lock', scores: lock.scores } : null,
      extraInstruction: MISTAKES_INSTRUCTION,
    }, null).finalMessage();
    if (message.stop_reason === 'max_tokens') throw new Error('the reply was cut off');
    return readCheck(message.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
  },

  // A connected student's check goes into their history on the site like a
  // weekly free report, so opening the essay there shows it again for free.
  async saveToAccount(uid, keys, essay, marked) {
    // Never over a report the student already has on this essay: it may be
    // the full one.
    if (await loadSavedReport(uid, keys.contentKey)) return;
    // The saved copy shows the bands the student was shown, which for a text
    // marked before are its locked ones.
    const raw = JSON.stringify({ ...(extractJson(marked.raw) as Record<string, unknown>), scores: marked.scores });
    await storeReport({
      uid,
      source: 'free',
      taskType: 'Task 2',
      keys,
      signature: essaySignature(essay),
      tier: 'limited',
      raw,
      scores: marked.scores,
      topic: marked.topic,
      issues: marked.mistakes,
      reportRef: getFirestore().collection('feedback_reports').doc(),
      upgrade: false,
      newLock: false,
    });
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.TELEGRAM_STUDENT_BOT_TOKEN;
  if (!token) {
    console.error('telegram: TELEGRAM_STUDENT_BOT_TOKEN is not set');
    return res.status(500).end();
  }

  // Opening this address in a browser connects the bot to it (ensureWebhook).
  if (req.method === 'GET') {
    try {
      const status = await ensureWebhook(token, { force: req.query?.force === '1' });
      return res.status(200).json({ connected: true, ...status });
    } catch (e) {
      console.error('telegram: could not set the webhook:', e);
      return res.status(502).json({ connected: false, error: 'Telegram did not accept the setup. Check the bot token in Vercel.' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // Only Telegram knows this secret: it was given it when the webhook was set.
  const expected = Buffer.from(webhookSecret(token));
  const got = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] ?? ''));
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return res.status(401).end();

  const update = req.body as TgUpdate | undefined;
  if (update && typeof update.update_id === 'number') {
    try {
      initFirebase();
      await handleUpdate(update, deps);
    } catch (e) {
      console.error('telegram: update failed:', e);
    }
  }
  // Always 200: Telegram sends an update again until it gets one, so a
  // broken update would otherwise come back forever.
  return res.status(200).end();
}
