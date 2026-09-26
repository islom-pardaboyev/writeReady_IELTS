import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initFirebase } from '../shared.js';
import { deleteExpiredLinks, sendDailyWords, sendReminders, syncBotProfile, WORD_HOURS } from '../studentBot.js';
import { continueBroadcasts } from '../broadcast.js';

/**
 * The Telegram bot's hourly job: the daily word, the "your free check is
 * back" messages, removing links that expired unopened, bringing Telegram's
 * command menu up to date after a deploy (syncBotProfile), and finishing an
 * admin post that paused (continueBroadcasts).
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
    // Housekeeping first and never in the way: the words and reminders go out
    // even when Telegram or the database hiccup here.
    const profileUpdated = await syncBotProfile().catch((e) => {
      console.error('bot-daily: could not check the command menu:', e);
      return false;
    });
    const linksDeleted = await deleteExpiredLinks().catch((e) => {
      console.error('bot-daily: could not delete expired links:', e);
      return 0;
    });
    const words = await sendDailyWords(hour);
    const reminders = await sendReminders();
    // Last, with what is left of the function's 300 s.
    const postsFinished = await continueBroadcasts(Date.now() + 150_000).catch((e) => {
      console.error('bot-daily: could not carry on a post:', e);
      return 0;
    });
    return res.status(200).json({ hour, words, reminders, linksDeleted, profileUpdated, postsFinished });
  } catch (e) {
    console.error('bot-daily: failed:', e);
    return res.status(500).json({ error: 'Daily words failed.' });
  }
}
