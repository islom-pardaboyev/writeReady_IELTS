import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { esc, tg } from '../telegramApi.js';
import { CONFIG_COLLECTION, CONFIG_DOC, RUNS, SAMPLES } from './model.js';
import { adminChatId, sendForReview } from './review.js';

/**
 * The evening housekeeping: rebuild the site when a public page changed, and
 * tell the admin how the day went.
 */

/** Midnight in Tashkent (UTC+5 all year) at the start of the day `now` falls in. */
export function tashkentDayStart(now = new Date()): Date {
  const day = new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T00:00:00Z`) - 5 * 3600 * 1000);
}

/**
 * Starts a production build through the Vercel deploy hook, but only when a
 * public page has changed since the last one: a sample was published, or a
 * published sample got its notes or its question's slug. The build reads the
 * published samples itself (scripts/prerender-questions.tsx).
 */
export async function rebuildIfChanged(
  { force = false, fetcher = fetch }: { force?: boolean; fetcher?: typeof fetch } = {},
): Promise<'triggered' | 'unchanged' | 'no-hook' | 'failed'> {
  const store = db();
  const configRef = store.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
  const config = await configRef.get();
  const last = config.exists ? config.get('lastDeployHookAt') : undefined;
  const since = last instanceof Timestamp ? last : Timestamp.fromMillis(0);
  if (!force) {
    const changed = await store.collection(SAMPLES).where('pageChangedAt', '>', since).limit(1).get();
    if (changed.empty) return 'unchanged';
  }
  const hook = (process.env.VERCEL_DEPLOY_HOOK_URL ?? '').trim();
  if (!hook) {
    console.error('samples: VERCEL_DEPLOY_HOOK_URL is not set, so published samples wait for the next deploy');
    return 'no-hook';
  }
  // Stamped before the call: a sample published while the build runs is
  // after the stamp, so the next evening builds again for it.
  const stamp = Timestamp.now();
  try {
    const res = await fetcher(hook, { method: 'POST' });
    if (!res.ok) throw new Error(`deploy hook answered ${res.status}`);
  } catch (e) {
    console.error('samples: the deploy hook failed:', e);
    return 'failed';
  }
  await configRef.set({ lastDeployHookAt: stamp }, { merge: true });
  return 'triggered';
}

export interface DayNumbers {
  publishedToday: number;
  waiting: number;
  needsManual: number;
  costUSD: number;
}

export async function dayNumbers(now = new Date()): Promise<DayNumbers> {
  const store = db();
  const start = Timestamp.fromDate(tashkentDayStart(now));
  const [published, waiting, needsManual, runs] = await Promise.all([
    store.collection(SAMPLES).where('publishedAt', '>=', start).count().get(),
    store.collection(SAMPLES).where('status', '==', 'pending').count().get(),
    store.collection(SAMPLES).where('status', '==', 'needs_manual').count().get(),
    store.collection(RUNS).where('collectedAt', '>=', start).get(),
  ]);
  const costUSD = runs.docs.reduce((sum, d) => sum + (Number(d.get('costUSD')) || 0), 0);
  return {
    publishedToday: published.data().count,
    waiting: waiting.data().count,
    needsManual: needsManual.data().count,
    costUSD,
  };
}

export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function summaryText(n: DayNumbers, rebuild?: string): string {
  const line = `Published today: ${n.publishedToday} | Waiting: ${n.waiting} | needs_manual: ${n.needsManual} | Generation cost: ${formatCost(n.costUSD)}`;
  const note = rebuild === 'triggered' ? '\n🚀 Rebuilding the site with today’s approvals.'
    : rebuild === 'no-hook' ? '\n⚠️ VERCEL_DEPLOY_HOOK_URL is not set: approvals go live with the next deploy.'
    : rebuild === 'failed' ? '\n⚠️ The deploy hook failed. Check the Vercel logs.'
    : '';
  return `📊 ${esc(line)}${note}`;
}

export async function sendSummary(text: string): Promise<boolean> {
  const chatId = adminChatId();
  if (!chatId) return false;
  await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  return true;
}

/**
 * Pending samples whose Telegram messages never went out (Telegram was down,
 * or ADMIN_TELEGRAM_CHAT_ID was not set yet) are sent now.
 */
export async function resendUnsent(max = 15): Promise<number> {
  const snap = await db().collection(SAMPLES).where('status', '==', 'pending').get();
  let sent = 0;
  for (const d of snap.docs) {
    if (sent >= max) break;
    if (d.get('review.sentAt')) continue;
    try {
      if (await sendForReview(d.id)) sent++;
    } catch (e) {
      console.error(`samples: could not send ${d.id} for review:`, e);
      // Stamped so one broken sample does not stop the rest every day.
      await d.ref.set({ review: { lastError: String((e as Error).message ?? e).slice(0, 300), lastTryAt: FieldValue.serverTimestamp() } }, { merge: true });
    }
  }
  return sent;
}
