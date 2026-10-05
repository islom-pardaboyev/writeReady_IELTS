import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signOut, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './config';

export { firebaseConfig };

// Secondary Firebase app for admin panel — isolated from the main site's auth
// so admin logins never overwrite a regular user's session
const ADMIN_APP_NAME = 'admin-panel';
const adminApp =
  getApps().find((a) => a.name === ADMIN_APP_NAME) ||
  initializeApp(firebaseConfig, ADMIN_APP_NAME);

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

// Fixed internal email the admin role's Firebase Auth account always uses
// (minted server-side in api/staff-login.ts) — used client-side to recognize
// an admin session, e.g. to bypass the maintenance gate.
export const ADMIN_EMAIL = 'admin@writeready.internal';

// The site owner's own account on the main site. /admin shows its sign-in form
// only when this account is signed in; everyone else gets "Access denied".
// This only hides the page — the admin password is still checked on the server.
export const OWNER_EMAIL = 'ipardaboyev574@gmail.com';

export type StaffSession =
  | { role: 'admin' }
  | { role: 'center'; centerId: string }
  | { role: 'teacher'; teacherId: string };

/**
 * The role api/staff-login.ts wrote into this panel session's sign-in token,
 * which is what firestore.rules and the api/ routes go by.
 *
 *   a StaffSession  the session works for that role
 *   null            no role: a session from before roles were added to
 *                   sign-in, which nothing accepts any more
 *   undefined       could not be read (offline with an expired token): keep
 *                   the session and let the next request decide
 */
export async function staffSessionOf(user: User): Promise<StaffSession | null | undefined> {
  let claims: Record<string, unknown>;
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch {
    return undefined;
  }
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  if (claims.staff === 'admin') return { role: 'admin' };
  if (claims.staff === 'center' && text(claims.centerId)) return { role: 'center', centerId: text(claims.centerId) };
  if (claims.staff === 'teacher' && text(claims.teacherId)) return { role: 'teacher', teacherId: text(claims.teacherId) };
  return null;
}

/**
 * Signs out a panel session that has no role. Every panel shares adminAuth,
 * so only a session that works for none of them is ended: a centre signed in
 * here is not signed out because someone opened /admin in another tab.
 */
export async function endSessionWithoutRole(user: User, session: StaffSession | null | undefined): Promise<void> {
  if (session === null && adminAuth.currentUser?.uid === user.uid) await signOut(adminAuth).catch(() => {});
}
