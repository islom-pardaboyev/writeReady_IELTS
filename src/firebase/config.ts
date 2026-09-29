import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { analyticsAllowed } from '../lib/consent';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBX1nra0EqXDL7xkL6fD_AcMOc09pEKY1M',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'writing-database-d0b7c.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'writing-database-d0b7c',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'writing-database-d0b7c.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1004044443581',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1004044443581:web:3bfdf0ab147ed0b7bfbcd4',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-SGCXYWD9F7',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics is non-essential storage: src/lib/consent.ts says it must wait for
// analyticsAllowed(), and the cookie notice and privacy policy promise no
// tracking. It used to start for every visitor, and Google then saw the full
// address of every page, including a report's, which carries the whole essay.
isSupported().then((supported) => {
  if (supported && analyticsAllowed()) getAnalytics(app);
});
