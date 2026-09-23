import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { markSeen } from '@/lib/seen';

/**
 * Stamps "last active" when a signed-in student moves to another page, so the
 * admin panel shows when they were last using the site, not only when they
 * opened it. A student could spend an hour writing and still show as
 * "active 1 hour ago".
 *
 * No timer: it runs on the student's own clicks, and markSeen's ten-minute
 * quiet window caps it at one request per ten minutes.
 */
export function RouteSeen() {
  const { pathname } = useLocation();
  useEffect(() => {
    void markSeen();
  }, [pathname]);
  return null;
}
