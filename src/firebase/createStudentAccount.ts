import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from './adminConfig';

/**
 * Creates a Firebase Auth account for a student on a THROWAWAY app instance.
 *
 * Firebase's client SDK signs the newly-created user into whatever auth
 * instance you use — so if we created the account on the main or admin auth
 * instance, it would kick the center admin out of their own session. Spinning
 * up a temporary app, creating the user there, then deleting the app keeps the
 * admin's session untouched.
 *
 * Returns the new user's uid. Re-throws Firebase errors (e.g. the caller can
 * check `code === 'auth/email-already-in-use'`).
 */
export async function createStudentAuthAccount(email: string, password: string): Promise<string> {
  const tempApp = initializeApp(firebaseConfig, `student-signup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const auth = getAuth(tempApp);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await signOut(auth).catch(() => {});
    return uid;
  } finally {
    await deleteApp(tempApp).catch(() => {});
  }
}
