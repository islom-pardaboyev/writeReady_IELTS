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
