import { useState, useEffect, useRef } from 'react';

/**
 * Counts up while `running`. A new `resetKey` (Practice and Quick pass a count
 * of "New question" presses) starts it again from 0:00 and keeps it running.
 */
export function useStopwatch(running: boolean, resetKey?: unknown) {
  const [seconds, setSeconds] = useState(0);
  const [key, setKey] = useState(resetKey);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset during render when the key changes (React's pattern for state that
  // follows a prop), so the old time is never shown for a frame.
  if (resetKey !== key) {
    setKey(resetKey);
    setSeconds(0);
  }

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  // `key` restarts the tick too, so the first second after a reset is a whole one.
  }, [running, key]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
