import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * After an in-app navigation, moves keyboard focus back to the top of the
 * document (so the next Tab reaches the skip link) and has screen readers
 * announce the new page. Without this, focus stays on the link that was
 * clicked, which may no longer be on screen.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // A page that deliberately focused a field (e.g. an editor) keeps it.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) return;

    ref.current?.focus({ preventScroll: true });
    // RouteTitle sets document.title in its own effect; read it on the next frame.
    const frame = requestAnimationFrame(() => setAnnouncement(document.title));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div ref={ref} tabIndex={-1} className="sr-only outline-none" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
