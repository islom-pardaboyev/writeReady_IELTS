import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";

/**
 * Registers the service worker, and offers the new version once a deploy has
 * landed behind an open tab.
 *
 * The offer is the point. A service worker serves the copy it cached, so
 * without something like this a returning visitor stays on an old build until
 * they clear their browser — and reloading them automatically, the other way
 * out, would throw away whatever essay was on screen. So it waits to be asked,
 * and it never nags: dismissing it leaves the new version to be picked up on
 * the next cold start.
 *
 * It sits at the top of the screen because the bottom of it is spoken for —
 * the cookie notice, the announcement card and the install prompt are all down
 * there, and any of them can be open at the same time as this.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

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
          onClick={() => updateServiceWorker(true)}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--ink-blue-solid)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload
        </button>

        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Later"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
