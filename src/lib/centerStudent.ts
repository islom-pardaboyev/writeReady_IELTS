import { adminAuth } from '@/firebase/adminConfig';

/**
 * Adds, renames, re-passwords or removes a learning-center student, and reads
 * the center's report scores, through api/center-student.ts. The center
 * portal and the admin panel both sign in on adminAuth, so one helper serves
 * both.
 */
export type CenterStudentResult = { ok: true; login?: string; uid?: string } | { ok: false; error: string };

async function post(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const idToken = await adminAuth.currentUser?.getIdToken();
    if (!idToken) return { ok: false, error: 'Your session has expired. Sign in again.' };
    const res = await fetch('/api/center-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: typeof data.error === 'string' ? data.error : 'Something went wrong. Try again.' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

async function call(body: Record<string, unknown>): Promise<CenterStudentResult> {
  const result = await post(body);
  if (!result.ok) return result;
  const { login, uid } = result.data;
  return { ok: true, login: typeof login === 'string' ? login : undefined, uid: typeof uid === 'string' ? uid : undefined };
}

/**
 * Adds a student: the server makes their sign-in account
 * (`<login>@writeready.student`, email already confirmed), their profile with
 * the center's plan, and the center's record of them, once it has checked
 * the center has a place left. Gives back the new student's uid.
 */
export function addCenterStudent(
  centerId: string,
  student: { fullName: string; login: string; password: string },
): Promise<CenterStudentResult> {
  return call({ action: 'create', centerId, ...student });
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

/** One feedback report of a center's student: just what the portal shows. */
export interface CenterReport {
  uid: string;
  scores: unknown;
  createdAt: Date | null;
}

/**
 * The feedback reports of the center's own students, and nobody else's. The
 * server reads them, because Firestore's rules cannot tell which center a
 * report's student belongs to. Throws when they cannot be loaded.
 */
export async function centerReports(centerId: string): Promise<CenterReport[]> {
  const result = await post({ action: 'reports', centerId });
  if (!result.ok) throw new Error(result.error);
  const list = Array.isArray(result.data.reports) ? result.data.reports : [];
  return list.map((r: Record<string, unknown>) => ({
    uid: typeof r.uid === 'string' ? r.uid : '',
    scores: r.scores ?? null,
    createdAt: typeof r.createdAt === 'number' ? new Date(r.createdAt) : null,
  }));
}
