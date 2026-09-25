import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Several small endpoints in one function. Vercel's Hobby plan deploys at
 * most 12 functions and the site already had 12 before the Telegram bot, so
 * these share one. vercel.json rewrites each address here with ?route=, so
 * the addresses themselves (/api/seen, /api/telegram, /api/bot-link,
 * /api/bot-daily) stay the same for the browser, Telegram and the cron jobs.
 *
 * Each route is loaded only when it is asked for, so a /api/seen stamp does
 * not start the AI client the bot needs. A new small endpoint can join here
 * the same way instead of taking a function of its own.
 */
type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const ROUTES: Record<string, () => Promise<{ default: Handler }>> = {
  seen: () => import('./_lib/routes/seen.js'),
  telegram: () => import('./_lib/routes/telegram.js'),
  'bot-link': () => import('./_lib/routes/botLink.js'),
  'bot-daily': () => import('./_lib/routes/botDaily.js'),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = typeof req.query.route === 'string' ? req.query.route : '';
  const load = Object.prototype.hasOwnProperty.call(ROUTES, route) ? ROUTES[route] : undefined;
  if (!load) return res.status(404).json({ error: 'Not found' });
  return (await load()).default(req, res);
}
