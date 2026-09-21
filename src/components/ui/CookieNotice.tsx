import { useEffect, useState } from "react";
import { Link } from "react-router";
import { HAS_NON_ESSENTIAL_STORAGE, readConsent, saveConsent, type ConsentChoice } from "@/lib/consent";

/**
 * Tells a first-time visitor what the site keeps in their browser.
 *
 * It does not block the page: nothing non-essential is stored here, so there
 * is nothing to hold back while the visitor decides, and a modal that traps
 * people before they can read anything is worse for them, not better. When
 * HAS_NON_ESSENTIAL_STORAGE is turned on, the same banner asks a real question
 * with a real "no" — see src/lib/consent.ts.
 */
export function CookieNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Read after mount: in a private window localStorage can throw, and the
    // first paint should not depend on it.
    if (readConsent() === null) setOpen(true);
  }, []);

  if (!open) return null;

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice);
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[400] border-t border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] sm:inset-x-4 sm:bottom-4 sm:mx-auto sm:max-w-[640px] sm:rounded-2xl sm:border"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <p className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          {HAS_NON_ESSENTIAL_STORAGE ? (
            <>
              We keep a little data in your browser to sign you in and remember your settings, and we would like to use
              some to see how the site is used. You can say no to the second part.
            </>
          ) : (
            <>
              We keep a little data in your browser — enough to sign you in and remember your theme and shortcuts. No
              advertising, no tracking.
            </>
          )}{" "}
          <Link
            to="/privacy#storage"
            className="font-semibold text-[var(--ink-blue)] underline underline-offset-2 hover:no-underline"
          >
            Read more
          </Link>
        </p>

        <div className="flex shrink-0 gap-2">
          {HAS_NON_ESSENTIAL_STORAGE && (
            <button
              type="button"
              onClick={() => choose("essential")}
              className="min-h-11 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Only essential
            </button>
          )}
          <button
            type="button"
            onClick={() => choose(HAS_NON_ESSENTIAL_STORAGE ? "all" : "essential")}
            className="min-h-11 rounded-lg bg-[var(--ink-blue-solid)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            {HAS_NON_ESSENTIAL_STORAGE ? "Accept all" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
