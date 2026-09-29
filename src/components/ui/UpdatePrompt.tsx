import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { moveToNewestBuild } from "@/lib/staleBuild";

/**
 * Registers the service worker, and offers the new version once a deploy has
 * landed behind an open tab.
 *
 * The offer is the point. Reloading automatically would throw away whatever
 * essay was on screen, so it waits to be asked, and it never nags: dismissing
 * it leaves the new version to be picked up on the next visit.
 *
 * Pages load from the network first (vite.config.ts), so a fresh visit is
 * already on the new build by the time the new worker finishes installing.
 * Offering a reload then would be a false alarm, so in that case the worker is
 * switched on quietly and nothing is shown.
 *
 * It sits at the top of the screen because the bottom of it is spoken for —
 * the cookie notice, the announcement card and the install prompt are all down
 * there, and any of them can be open at the same time as this.
 */
export function UpdatePrompt() {
  const [show, setShow] = useState(false);

  useRegisterSW({
    onNeedRefresh() {
      void offerIfBehind().then(setShow);
    },
    // The library reloads every tab once the new worker takes over. That
    // includes tabs where nobody pressed Reload, like one with an essay open
    // while the worker was switched on from another tab. The Reload button
    // does its own reload, so this does nothing.
    onNeedReload() {},
  });

  if (!show) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-[350] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-[0_4px_24px_rgba(0,0,0,0.12)] sm:inset-x-auto sm:right-4 sm:w-[380px]"
    >
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          A new version of WriteReady is ready.
        </p>

        <button
          type="button"
          onClick={() => void moveToNewestBuild()}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--ink-blue-solid)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload
        </button>

        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Later"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * True when this tab runs an older build than the waiting worker. The worker's
 * file lists every file of its build, so if it names the script this page was
 * started from, the page is already current: the worker is switched on and
 * false comes back. Any doubt counts as behind, so the offer still shows.
 */
async function offerIfBehind(): Promise<boolean> {
  try {
    const waiting = (await navigator.serviceWorker.getRegistration())?.waiting;
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
    if (!waiting || !entry) return true;
    const workerFile = await fetch(waiting.scriptURL, { cache: "no-store" }).then((r) => r.text());
    if (!workerFile.includes(new URL(entry.src).pathname.slice(1))) return true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return false;
  } catch {
    return true;
  }
}
