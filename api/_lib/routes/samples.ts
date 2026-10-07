import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initFirebase, getUid } from '../shared.js';
import { ConsentError, consentStatus, readSession, readShare, submitConsent } from '../samples/consent.js';
import { sendForReview } from '../samples/review.js';

/**
 * The feedback page's sample-answer card (src/components/feedback/SampleConsentCard.tsx).
 *
 *   POST { action: 'status', mode, tasks }
 *        -> { offer: [{ taskType, band }], credit }   essays the student may be asked
 *           about, and whether sharing still earns the free assessment
 *   POST { action: 'consent', mode, tasks, decision: 'yes' | 'no', share: ['task1', ...] }
 *        -> { shared, creditPending }   creditPending: +1 free assessment once the admin approves
 *
 * `tasks` is every essay on the feedback page ({ taskType, questionId?,
 * question, essay }). The rules are in api/_lib/samples/consent.ts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e) {
    console.error('samples: Firebase init failed:', e);
    return res.status(500).json({ error: 'The server could not start. Please try again shortly.' });
  }
  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const session = readSession(body);
    if (body.action === 'status') {
      return res.status(200).json(await consentStatus(uid, session));
    }
    if (body.action === 'consent') {
      const decision = body.decision === 'yes' ? 'yes' : body.decision === 'no' ? 'no' : null;
      if (!decision) return res.status(400).json({ error: 'Choose yes or no.' });
      const result = await submitConsent(uid, session, decision, readShare(body.share));
      // Awaited: a serverless function can be frozen once it has answered.
      // A message that fails here is sent by the next cron run instead.
      for (const id of result.sampleIds) {
        await sendForReview(id).catch((e) => console.error(`samples: could not send ${id} for review:`, e));
      }
      return res.status(200).json({ shared: result.sampleIds.length, creditPending: result.creditPending });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    if (e instanceof ConsentError) {
      const status = e.code === 'DAILY_LIMIT' ? 429 : e.code === 'ALREADY_DECIDED' ? 409 : e.code === 'NO_PROFILE' ? 404 : 400;
      return res.status(status).json({ error: e.message, code: e.code });
    }
    console.error('samples: request failed:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
