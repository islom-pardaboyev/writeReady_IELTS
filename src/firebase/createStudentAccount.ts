import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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

/**
 * Undoes createStudentAuthAccount when the Firestore writes that follow it
 * fail. Without this the login stays taken by an account that has no profile,
 * so the next try with the same login is refused as "already taken" and the
 * center is stuck. Signs in as the student (it has just been created, so the
 * password is at hand) and deletes that account.
 *
 * Never throws: it runs while another error is already being handled.
 */
export async function deleteStudentAuthAccount(email: string, password: string): Promise<void> {
  const tempApp = initializeApp(firebaseConfig, `student-rollback-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const auth = getAuth(tempApp);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await deleteUser(cred.user);
  } catch (e) {
    console.error('Could not roll back the student auth account:', e);
  } finally {
    await deleteApp(tempApp).catch(() => {});
  }
}
