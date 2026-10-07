import { timingSafeEqual } from 'crypto';
import type { VercelRequest } from '@vercel/node';

/**
 * Whether a request may run a job that is not for visitors: the hourly bot job
 * (api/_lib/routes/botDaily.ts) and connecting the bot to Telegram
 * (api/_lib/routes/telegram.ts, GET).
 *
 * Vercel's scheduler sends `Authorization: Bearer <CRON_SECRET>` on every cron
 * call when a CRON_SECRET variable is set in the project. Anyone else without
 * that secret is refused, so the job cannot be run over and over from outside
 * (each run reads the whole student list and calls Telegram).
 *
 * On Vercel a missing CRON_SECRET refuses everything, so forgetting to set it
 * stops the jobs (a loud, visible failure) rather than leaving them open. That
 * includes preview deployments: they hold the live database and AI keys too.
 * Only on your own machine (`vercel dev`, or no VERCEL_ENV at all) does the
 * job run without it.
 */
export function cronAllowed(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development';
  const got = Buffer.from(String(req.headers.authorization ?? ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
