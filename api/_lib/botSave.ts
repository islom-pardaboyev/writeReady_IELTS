import { getFirestore } from 'firebase-admin/firestore';
import { extractJson } from './bandScore.js';
import { essaySignature, loadSavedReport, type EssayKeys } from './savedReports.js';
import type { Marked } from './studentBot.js';
import { storeReport } from '../feedback.js';

/**
 * Puts a bot check into a student's history on the site, like a weekly free
 * report, so opening the essay there shows it without marking it again.
 * Used for a connected student's checks (api/_lib/routes/telegram.ts) and
 * when a "See full feedback" link opens (api/_lib/routes/botLink.ts).
 *
 * Never over a report the student already has on this essay: it may be the
 * full one.
 */
export async function saveBotReport(uid: string, keys: EssayKeys, essay: string, marked: Marked): Promise<void> {
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
}
