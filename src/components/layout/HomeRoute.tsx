import { Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { LandingPage } from '@/pages/LandingPage';

/**
 * Signed-in students never see the landing page: "/" sends them to their
 * dashboard. The installed app opens at "/", so without this every launch
 * started on the marketing page. Staff (@writeready.internal) accounts are
 * left alone, because the dashboard sends them back to "/" when no admin or
 * center session is active, which would loop.
 */
export function HomeRoute() {
  const { user, loading } = useAuth();
  if (user && !user.email?.endsWith('@writeready.internal')) {
    return <Navigate to="/dashboard" replace />;
  }
  // While Firebase restores the session, show nothing rather than a flash of
  // the landing page a signed-in student is about to leave.
  if (loading) return null;
  return <LandingPage />;
}
