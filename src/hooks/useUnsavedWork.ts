import { useCallback, useEffect, type MouseEvent } from 'react';

const LEAVE_MESSAGE = 'You have unsaved essay text that hasn’t been submitted. Leave this page?';

// How many mounted pages currently hold unsaved essay text, so code outside
// those pages (keyboard shortcuts) can ask before navigating away.
let pagesWithUnsavedWork = 0;

/** For navigation that doesn't go through a page's own links. */
export function confirmLeaveUnsavedWork(): boolean {
  return pagesWithUnsavedWork === 0 || window.confirm(LEAVE_MESSAGE);
}

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
    pagesWithUnsavedWork++;
    return () => {
      window.removeEventListener('beforeunload', handler);
      pagesWithUnsavedWork--;
    };
  }, [hasUnsavedWork]);

  return useCallback(
    (e: MouseEvent) => {
      if (hasUnsavedWork && !window.confirm(LEAVE_MESSAGE)) e.preventDefault();
    },
    [hasUnsavedWork],
  );
}
