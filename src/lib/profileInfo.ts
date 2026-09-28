import type { User } from 'firebase/auth';
import type { UserProfile } from '../types';

// How the dashboard header and My Account name a student and date their account.

/** Their chosen name, else a center login, else the start of their email. */
export function profileName(user: User, profile: UserProfile | null): string {
  return user.displayName?.trim() || profile?.studentLogin || user.email?.split('@')[0] || 'Student';
}

/** When they joined: the profile's date, or Firebase Auth's if the profile has none. */
export function joinedDate(user: User, profile: UserProfile | null): Date | null {
  const fromProfile = profile?.createdAt instanceof Date && !isNaN(profile.createdAt.getTime()) ? profile.createdAt : null;
  const fromAuth = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
  return fromProfile ?? (fromAuth && !isNaN(fromAuth.getTime()) ? fromAuth : null);
}
