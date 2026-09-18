import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { onAuthStateChanged } from 'firebase/auth';
import { adminAuth, ADMIN_EMAIL } from '@/firebase/adminConfig';
import { getMaintenanceStatus, type MaintenanceStatus } from '@/hooks/useFeatureFlag';
import { MaintenancePage } from '@/pages/MaintenancePage';

const STAFF_PATHS = new Set(['/admin', '/teacher-portal', '/center-admin']);

const PageSpinner = (
  <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
    <div className="animate-spin w-8 h-8 border-2 border-[var(--ink-blue)] border-t-transparent rounded-full" />
  </div>
);

/**
 * Site-wide kill switch: when maintenance mode is on, students get the
 * maintenance page instead of the app. The staff portals stay reachable, and
 * an admin session bypasses it everywhere else, so the site keeps working
 * normally while you fix things.
 *
 * Status is checked once, when the visitor opens the site; tabs that are
 * already open pick up a change on their next reload. Until that one check
 * returns we show a spinner rather than risk a flash of a possibly broken app.
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

  useEffect(() => {
    let cancelled = false;
    getMaintenanceStatus().then((s) => { if (!cancelled) setStatus(s); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(adminAuth, (user) => {
      setIsAdmin(user?.email === ADMIN_EMAIL);
    });
  }, []);

  // Staff tools stay open: /admin so maintenance can always be turned off,
  // and the partner portals so teachers and centers keep working.
  if (STAFF_PATHS.has(location.pathname)) return <>{children}</>;
  if (isAdmin) return <>{children}</>;
  if (status === null) return PageSpinner;
  if (status.enabled) return <MaintenancePage startedAt={status.startedAt} endsAt={status.endsAt} />;
  return <>{children}</>;
}
