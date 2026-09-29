import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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
