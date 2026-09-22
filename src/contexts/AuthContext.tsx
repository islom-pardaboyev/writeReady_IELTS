import { useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
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
import { auth } from '../firebase/config';
import { createUserProfile, getUserProfile } from '../firebase/firestore';
import { markSeen, watchSeen } from '../lib/seen';
import type { UserProfile } from '../types';
import { AuthContext } from './authContextDef';

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

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(cred.user.uid, email);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logOut = async () => {
    await signOut(auth);
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
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signInWithGoogle, logOut, refreshProfile, updateDisplayName, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
