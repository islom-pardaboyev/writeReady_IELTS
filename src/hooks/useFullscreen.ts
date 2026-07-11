import { useState, useEffect, useCallback } from 'react';

// Browser Fullscreen API wrapper. Pressing Esc exits fullscreen natively and
// fires `fullscreenchange`, so the state stays in sync without extra handling.
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* some browsers block fullscreen without a user gesture or by policy */
    }
  }, []);

  return { isFullscreen, toggle };
}
