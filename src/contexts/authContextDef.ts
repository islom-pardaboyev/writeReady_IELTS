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
  /**
   * The picture to show for the signed-in student: their own photo when they
   * set one (src/lib/profilePhoto.ts), else their Google photo, else null.
   */
  avatarUrl: string | null;
  /** Shows a photo just saved (or removed, with null) everywhere at once. */
  photoChanged: (version: number | null, photo: string | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
