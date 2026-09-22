import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { readConsent } from "@/lib/consent";
import {
  bannerHidden,
  canInstall,
  canPromptDirectly,
  dismissBanner,
  getVersion,
  install,
  isStandalone,
  snoozed,
  stepsVisible,
  subscribe,
} from "@/lib/pwaInstall";

/**
 * Offers to put WriteReady on the visitor's home screen, unprompted.
 *
 * The header's "Download app" item is the deliberate way in; this is the one
 * that goes looking for people who would never think to check a menu. What it
 * can offer depends on the platform — see src/lib/pwaInstall.ts.
 */

/** Long enough that the banner never lands on someone still reading the page. */
const DELAY_MS = 5000;

export function InstallPrompt() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const timer = window.setTimeout(() => {
      // The cookie notice owns the bottom of the screen until it is answered,
      // and two stacked banners is one too many. Checked once, on purpose: if
      // it is still up, this visit stays quiet and the offer comes back on the
      // next page load.
      if (readConsent() === null) return;
      setWaited(true);
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  // Asked for from the header, so it ignores both the delay and any earlier
  // dismissal — someone who just tapped "Download app" wants it now.
  const summoned = stepsVisible();
  if (!summoned && !(waited && !bannerHidden() && canInstall())) return null;

  // A browser that handed us an event can do the install itself, whatever the
  // platform sniffing concluded.
  const mode = canPromptDirectly() ? "button" : "steps";

  return (
    <div
      role="region"
      aria-label="Install WriteReady"
      className="fixed inset-x-0 bottom-0 z-[300] border-t border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[420px] sm:rounded-2xl sm:border"
    >
      <div className="flex items-start gap-3">
        <img
          src="/pwa-192x192.png"
          alt=""
          width={40}
          height={40}
          className="mt-0.5 hidden h-10 w-10 shrink-0 rounded-xl sm:block"
        />

        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Install WriteReady</p>

          {mode === "steps" ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              <span>Tap</span>
              <Share className="inline h-4 w-4 shrink-0" aria-hidden="true" />
              <span>in the Safari bar, then</span>
              <SquarePlus className="inline h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium text-[var(--text-primary)]">Add to Home Screen</span>.
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              Keep it on your home screen. It opens full screen, without the browser bars.
            </p>
          )}

          {mode === "button" && (
            <button
              type="button"
              onClick={install}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--ink-blue-solid)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Install
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={dismissBanner}
          aria-label="Not now"
          className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
