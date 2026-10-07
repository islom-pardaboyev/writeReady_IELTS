import { useAuth } from './useAuth';
import type { UsageRecord } from '../types';

/**
 * This plan month's reports, from the profile the app already loaded
 * (src/firebase/firestore.ts getUserProfile). It used to open its own live
 * subscription to the same users document, one more read on every dashboard
 * and account visit; the profile is reloaded after every report instead
 * (refreshProfile), so the count still moves when it should.
 */
export function useUsage(uid: string | null): { usage: UsageRecord | null; loading: boolean } {
  const { profile, loading } = useAuth();
  const usage = uid && profile?.uid === uid ? profile.usage : null;
  return { usage, loading };
}
