import { createContext } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types';

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /**
   * 'confirm-email': the password was right, but the account's email was
   * never confirmed, so it was signed straight back out. The caller emails a
   * code (src/components/auth/EmailCodeSignIn.tsx) before letting them in.
   */
  signIn: (email: string, password: string) => Promise<'signed-in' | 'confirm-email'>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
