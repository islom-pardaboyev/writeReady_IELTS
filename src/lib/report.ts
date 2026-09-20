import { auth } from '@/firebase/firebase';

/**
 * Sends user feedback and crash reports to api/report.ts, which saves them and
 * pings the admin's Telegram.
 *
 * Auth is attached when there is a signed-in user and skipped when there is
 * not — a crash report from a signed-out visitor is still worth having.
 */

export type ReportType = 'crash' | 'bug' | 'idea' | 'other' | 'rating';

export interface ReportInput {
  type: ReportType;
  message?: string;
  rating?: 'up' | 'down';
  error?: string;
  stack?: string;
}

export async function sendReport(input: ReportInput): Promise<{ ok: boolean; error?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Signing in failed or the session is broken — send it anonymously.
  }

  try {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, page: window.location.pathname + window.location.search }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? 'Could not send. Please try again.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No connection. Please check your internet and try again.' };
  }
}
