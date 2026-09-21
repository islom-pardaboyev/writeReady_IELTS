import { useCallback, useRef, useState } from 'react';

// Resolves after the browser has had a chance to paint. The timer is a
// fallback: a hidden tab never runs animation frames, and the Mock exam still
// has to save its PDF when time runs out while the student is on another tab.
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 150);
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs one slow job at a time and tells the UI while it is running (`busy`).
 *
 * Building a PDF freezes the page for a few seconds. Without this, the button
 * cannot repaint before the freeze, so it looks dead; the student clicks again
 * and again, and all those clicks wait in the browser's queue. They fire the
 * moment the freeze ends, and each one saved another PDF. So:
 *
 *  1. `busy` is shown and painted before the job starts,
 *  2. a second call while a job runs is ignored, and
 *  3. the lock stays on for `cooldownMs` after the job ends, so the clicks that
 *     piled up during the freeze arrive while it is still locked and are dropped.
 */
export function useSingleRun(cooldownMs = 800) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const run = useCallback(
    async (job: () => Promise<void>): Promise<void> => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      try {
        await nextPaint();
        await job();
      } finally {
        await sleep(cooldownMs);
        running.current = false;
        setBusy(false);
      }
    },
    [cooldownMs],
  );

  return { busy, run };
}
