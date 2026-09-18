import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { adminAuth, ADMIN_EMAIL } from '@/firebase/adminConfig';
import { subscribeMaintenanceStatus, type MaintenanceStatus } from '@/hooks/useFeatureFlag';
import { MaintenancePage } from '@/pages/MaintenancePage';

const PageSpinner = (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
  </div>
);

/**
 * Site-wide kill switch: when maintenance mode is on, every visitor gets the
 * maintenance page instead of the app. /admin always stays reachable (so the
 * flag can always be turned back off), and an admin session bypasses it
 * everywhere else, so the site keeps working normally while you fix things.
 *
 * The status is unknown until the first Firestore read resolves, so we hold
 * up rendering behind a spinner rather than risk a flash of a possibly
 * broken app for a fresh visit that lands while maintenance is on.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  // Optimistic: an already-logged-in admin's browser has this set from a
  // prior /admin login, so they skip straight past the gate on other pages
  // too, instead of waiting on Firebase Auth to rehydrate. This is a display
  // bypass only — it doesn't gate any data access — so a spoofed value in
  // another visitor's console just shows them the (normal, public) site.
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('adminLoggedIn') === 'true');

  useEffect(() => subscribeMaintenanceStatus(setStatus), []);

  useEffect(() => {
    return onAuthStateChanged(adminAuth, (user) => {
      setIsAdmin(user?.email === ADMIN_EMAIL);
    });
  }, []);

  if (location.pathname === '/admin') return <>{children}</>;
  if (isAdmin) return <>{children}</>;
  if (status === null) return PageSpinner;
  if (status.enabled) return <MaintenancePage startedAt={status.startedAt} endsAt={status.endsAt} />;
  return <>{children}</>;
}
