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
  constructor(
    public method: string,
    public code: number,
    description: string,
    /** Seconds Telegram asks to wait, when it says too many messages were sent (429). */
    public retryAfter?: number,
  ) {
    super(`${method}: ${code} ${description}`);
  }
  /** The student blocked the bot or deleted their account: stop writing to them. */
  get unreachable(): boolean {
    return this.code === 403;
  }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (standIn) return (await standIn(method, body)) as T;
  return call<T>(method, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface Upload {
  /** The form field Telegram expects the file in, e.g. 'photo'. */
  field: string;
  name: string;
  type: string;
  data: Buffer;
}

/**
 * The same, sending a file from this server (a picture the admin chose).
 * Telegram answers with the file's id, which later messages reuse instead of
 * uploading it again. The stand-in gets a short note in place of the file.
 */
export async function tgUpload<T = unknown>(method: string, fields: Record<string, unknown>, file: Upload): Promise<T> {
  if (standIn) return (await standIn(method, { ...fields, [file.field]: `<upload ${file.name}, ${file.data.length} bytes>` })) as T;
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  form.append(file.field, new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  return call<T>(method, { body: form });
}

async function call<T>(method: string, init: { headers?: Record<string, string>; body: string | FormData }): Promise<T> {
  const token = process.env.TELEGRAM_STUDENT_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_STUDENT_BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', ...init });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number };
  } | null;
  if (!res.ok || !data?.ok) {
    throw new TelegramError(method, data?.error_code ?? res.status, data?.description ?? 'request failed', data?.parameters?.retry_after);
  }
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
