import { adminAuth } from '@/firebase/adminConfig';

/**
 * Renames, re-passwords or removes a learning-center student through
 * api/center-student.ts. The center portal and the admin panel both sign in
 * on adminAuth, so one helper serves both.
 */
export type CenterStudentResult = { ok: true; login?: string } | { ok: false; error: string };

async function call(body: Record<string, unknown>): Promise<CenterStudentResult> {
  try {
    const idToken = await adminAuth.currentUser?.getIdToken();
    if (!idToken) return { ok: false, error: 'Your session has expired. Sign in again.' };
    const res = await fetch('/api/center-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; login?: string };
    if (!res.ok) return { ok: false, error: data.error ?? 'Something went wrong. Try again.' };
    return { ok: true, login: data.login };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

/** Changes the name, and optionally the login and password the student signs in with. */
export function updateCenterStudent(
  centerId: string,
  studentId: string,
  changes: { fullName: string; login: string; password?: string },
): Promise<CenterStudentResult> {
  return call({ action: 'update', centerId, studentId, ...changes });
}

/** Takes the student out of the center. Their account stays, on the free plan. */
export function removeCenterStudent(centerId: string, studentId: string): Promise<CenterStudentResult> {
  return call({ action: 'remove', centerId, studentId });
}
