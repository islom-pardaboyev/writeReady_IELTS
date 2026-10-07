import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { initFirebase } from '../shared.js';
import { cronAllowed } from '../cronAuth.js';
import { anthropicBatches, collectBatches, prepareWaitingPages, submitBatch } from '../samples/generate.js';
import { dayNumbers, rebuildIfChanged, resendUnsent, sendSummary, summaryText } from '../samples/daily.js';

/**
 * The sample answers' daily jobs. vercel.json runs this twice a day (the
 * Hobby plan allows each cron once a day):
 *
 *   02:00 UTC (07:00 Tashkent)  'morning'  collect yesterday's batch, send its
 *                                          drafts for review, send a new batch
 *   15:00 UTC (20:00 Tashkent)  'evening'  collect the morning batch, rebuild
 *                                          the site if a page changed, and send
 *                                          the daily summary
 *
 * Vercel names the job in x-vercel-cron-schedule. By hand, with the
 * CRON_SECRET (api/_lib/cronAuth.ts):
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://www.writeready.uz/api/samples-cron?job=morning"
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://www.writeready.uz/api/samples-cron?job=evening&rebuild=1"
 */
export type Job = 'morning' | 'evening';

export function jobFor(query: unknown, schedule: string | undefined, now = new Date()): Job {
  if (query === 'morning' || query === 'evening') return query;
  const hour = schedule ? Number(schedule.trim().split(/\s+/)[1]) : now.getUTCHours();
  return Number.isInteger(hour) && hour >= 2 && hour < 12 ? 'morning' : 'evening';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cronAllowed(req)) {
    console.error('samples-cron: refused a request without the right CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const schedule = req.headers['x-vercel-cron-schedule'];
  const job = jobFor(req.query.job, typeof schedule === 'string' ? schedule : undefined);

  try {
    initFirebase();
  } catch (e) {
    console.error('samples-cron: Firebase init failed:', e);
    return res.status(500).json({ error: 'Firebase init failed.' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = apiKey ? new Anthropic({ apiKey }) : null;
  const api = client ? anthropicBatches(client) : null;
  if (!api) console.error('samples-cron: ANTHROPIC_API_KEY is not set; no drafts this run');

  const report: Record<string, unknown> = { job };
  // Each step on its own: a failing one is logged and the rest still run.
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      const out = await run();
      report[name] = out;
      return out;
    } catch (e) {
      console.error(`samples-cron: ${name} failed:`, e);
      report[name] = { error: (e as Error).message };
      return undefined;
    }
  };

  if (api) await step('collected', () => collectBatches(api));
  await step('resent', () => resendUnsent());
  // Before the rebuild: an approved sample with no page address yet gets one.
  await step('pagesPrepared', () => prepareWaitingPages(client));
  if (job === 'morning' && api) await step('submitted', () => submitBatch(api));
  if (job === 'evening') {
    const rebuild = await step('rebuild', () => rebuildIfChanged({ force: req.query.rebuild === '1' }));
    const numbers = await step('numbers', () => dayNumbers());
    if (numbers) await step('summary', () => sendSummary(summaryText(numbers, rebuild)));
  }
  return res.status(200).json(report);
}
