import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBX1nra0EqXDL7xkL6fD_AcMOc09pEKY1M',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'writing-database-d0b7c.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'writing-database-d0b7c',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'writing-database-d0b7c.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1004044443581',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1004044443581:web:3bfdf0ab147ed0b7bfbcd4',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-SGCXYWD9F7',
};

// Secondary Firebase app for admin panel — isolated from the main site's auth
// so admin logins never overwrite a regular user's session
const ADMIN_APP_NAME = 'admin-panel';
const adminApp =
  getApps().find((a) => a.name === ADMIN_APP_NAME) ||
  initializeApp(firebaseConfig, ADMIN_APP_NAME);

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
