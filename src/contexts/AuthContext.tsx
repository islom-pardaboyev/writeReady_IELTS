import { useEffect, useState, type ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth';
import { mustConfirmEmail } from '@shared/emailGate';
import { auth } from '../firebase/config';
import { createUserProfile, getUserProfile } from '../firebase/firestore';
import { markSeen, watchSeen } from '../lib/seen';
import type { UserProfile } from '../types';
import { AuthContext } from './authContextDef';
import { clearAllDrafts } from '../hooks/useDraft';

/**
 * A password account whose email nobody confirmed (made before sign-up asked
 * for a code, or straight through Firebase) does not get in. The server
 * refuses it too (api/_lib/shared.ts).
 */
async function mustConfirm(u: User): Promise<boolean> {
  // Most accounts never need the token read below.
  if (u.emailVerified || !u.providerData.some((p) => p.providerId === 'password')) return false;
  // How they signed in this time. Offline with an expired token, assume the password.
  const provider = await u.getIdTokenResult().then((t) => t.signInProvider, () => 'password');
  return mustConfirmEmail(provider, u.email, u.emailVerified);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u: User) => {
    let p = await getUserProfile(u.uid);
    if (!p) {
      await createUserProfile(u.uid, u.email ?? '');
      p = await getUserProfile(u.uid);
    }
    setProfile(p);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u && (await mustConfirm(u))) {
        // Signing out calls back here with no user, which ends the loading.
        await signOut(auth);
        return;
      }
      // Signed out, or in as someone else, while that was being checked.
      if (u !== auth.currentUser) return;
      setUser(u);
      if (u) {
        // A profile that will not load is no reason to skip the stamp, or to
        // leave the whole app sitting on its loading screen.
        try {
          await loadProfile(u);
        } catch (e) {
          console.error('loadProfile failed:', e);
        }
        // After the profile exists, so a brand new account is never stamped
        // before it is written. Not awaited: nothing on screen waits for it.
        void markSeen();
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    // Catches the visits this callback never hears about: a tab left open for
    // days, or a phone waking up with the site still on screen.
    const unwatch = watchSeen();
    return () => {
      unsub();
      unwatch();
    };
  }, []);

  // There is no sign-up here on purpose: a password account is only made once
  // the emailed code proves the address (api/_lib/emailCode.ts).
  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!(await mustConfirm(cred.user))) return 'signed-in' as const;
    await signOut(auth);
    return 'confirm-email' as const;
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logOut = async () => {
    await signOut(auth);
    // Essays being written stay in this browser (src/hooks/useDraft.ts); the
    // next person to sign in on this computer must not find them.
    clearAllDrafts();
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const updateDisplayName = async (name: string) => {
    if (!auth.currentUser) throw new Error('Not signed in.');
    await updateProfile(auth.currentUser, { displayName: name });
    setUser({ ...auth.currentUser });
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!auth.currentUser || !auth.currentUser.email) throw new Error('Not signed in.');
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signInWithGoogle, logOut, refreshProfile, updateDisplayName, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
