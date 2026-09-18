import { useCallback, useEffect, type MouseEvent } from 'react';

const LEAVE_MESSAGE = 'You have unsaved essay text that hasn’t been submitted. Leave this page?';

/**
 * Warns before unsaved essay text is lost. Covers reloads and tab close
 * (`beforeunload`) and returns a click handler for in-app links, since the app
 * uses a declarative <BrowserRouter> where `useBlocker` is unavailable.
 */
export function useUnsavedWork(hasUnsavedWork: boolean) {
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork]);

  return useCallback(
    (e: MouseEvent) => {
      if (hasUnsavedWork && !window.confirm(LEAVE_MESSAGE)) e.preventDefault();
    },
    [hasUnsavedWork],
  );
}
