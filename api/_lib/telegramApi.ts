import { createHash } from 'crypto';

/**
 * Calls to the Telegram Bot API for the student bot (with its own token,
 * TELEGRAM_STUDENT_BOT_TOKEN). The admin bot in api/report.ts is separate.
 *
 * scripts/test-student-bot.ts swaps in a stand-in, so the bot can be tested
 * without messaging real students.
 */
export type TelegramCall = (method: string, body: Record<string, unknown>) => Promise<unknown>;

let standIn: TelegramCall | null = null;

export function setTestTelegram(fake: TelegramCall | null): void {
  standIn = fake;
}

export class TelegramError extends Error {
  constructor(public method: string, public code: number, description: string) {
    super(`${method}: ${code} ${description}`);
  }
  /** The student blocked the bot or deleted their account: stop writing to them. */
  get unreachable(): boolean {
    return this.code === 403;
  }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (standIn) return (await standIn(method, body)) as T;
  const token = process.env.TELEGRAM_STUDENT_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_STUDENT_BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string } | null;
  if (!res.ok || !data?.ok) throw new TelegramError(method, data?.error_code ?? res.status, data?.description ?? 'request failed');
  return data.result as T;
}

/**
 * The secret Telegram sends with every update (X-Telegram-Bot-Api-Secret-Token),
 * derived from the bot token so there is no second secret to keep. Only
 * Telegram, which was given it when the webhook was set, can send it.
 */
export function webhookSecret(token: string): string {
  return createHash('sha256').update(`writeready-student-bot:${token}`).digest('hex').slice(0, 48);
}

let username: string | null = null;

/** The bot's @username, for invite links. Asked once per server start. */
export async function botUsername(): Promise<string> {
  if (!username) username = (await tg<{ username: string }>('getMe', {})).username;
  return username;
}

/** Telegram HTML mode only needs these three escaped. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
