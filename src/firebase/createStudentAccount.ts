import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, deleteUser, signInWithEmailAndPassword } from 'firebase/auth';
import { firebaseConfig } from './adminConfig';

// The student's sign-in account is made on the server (api/center-student.ts,
// `create`), with its email already confirmed. It used to be made here through
// Firebase's public sign-up address, which anyone can call for themselves.

/**
 * Undoes the server's `create` when the Firestore writes that follow it
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
