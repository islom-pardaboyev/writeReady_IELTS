import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initFirebase } from '../shared.js';
import { sendDailyWords, sendReminders, WORD_HOURS } from '../studentBot.js';

/**
 * The Telegram bot's daily word, and its "your free check is back" messages.
 * vercel.json runs this once a day for every hour a student can pick; the
 * free plan allows one daily job per hour, fired somewhere within that hour.
 * Vercel names the job that fired in x-vercel-cron-schedule (UTC); Tashkent
 * is UTC+5 all year.
 *
 * Opened by hand, it serves the current Tashkent hour, whose students are
 * due their word now anyway, and only reminders already due, so it can never
 * send anything early.
 */
export function tashkentHour(schedule: string | undefined, now = new Date()): number {
  const utcHour = schedule ? Number(schedule.trim().split(/\s+/)[1]) : NaN;
  const hour = Number.isInteger(utcHour) ? utcHour : now.getUTCHours();
  return (hour + 5) % 24;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const schedule = req.headers['x-vercel-cron-schedule'];
  const hour = tashkentHour(typeof schedule === 'string' ? schedule : undefined);
  if (!WORD_HOURS.includes(hour)) return res.status(200).json({ skipped: true, hour });

  try {
    initFirebase();
    const words = await sendDailyWords(hour);
    const reminders = await sendReminders();
    return res.status(200).json({ hour, words, reminders });
  } catch (e) {
    console.error('bot-daily: failed:', e);
    return res.status(500).json({ error: 'Daily words failed.' });
  }
}
