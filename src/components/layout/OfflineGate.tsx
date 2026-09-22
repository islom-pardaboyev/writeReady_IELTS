import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import Logo from "/logo.svg";

const TELEGRAM_URL = "https://t.me/writeready_admin";

/**
 * Closes the app while the device is off the network.
 *
 * Nothing here works without a connection: the prompts, the marking and every
 * essay live on the server, so a visitor left poking at a cached shell would
 * only find things failing one at a time. This says the one true thing instead
 * and waits.
 *
 * It covers the app rather than replacing it. The routes underneath stay
 * mounted, so a half written essay is still in the editor when the connection
 * comes back and this screen closes over it.
 *
 * `navigator.onLine` can only be trusted in one direction: false means there
 * is no network at all, while true only means something is plugged in. So the
 * screen opens on false, and Try again settles the other direction by actually
 * asking the network for a file.
 */
export function OfflineGate() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOffline(false);
      setCheckFailed(false);
    };
    const goOffline = () => setOffline(true);

    // Read here rather than in useState: the connection can drop between the
    // first render and this effect, and this way the events are already
    // attached when we look.
    setOffline(!navigator.onLine);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  const retry = async () => {
    setChecking(true);
    setCheckFailed(false);
    try {
      // The query string keeps this out of the service worker's precache, so
      // it is a real trip to the network and not a file we already hold.
      await fetch(`/logo.svg?ping=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      setOffline(false);
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="No internet connection"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-[var(--bg-base)] text-[var(--text-primary)]"
    >
      <div className="flex min-h-full flex-col">
        <header className="mx-auto flex w-full max-w-[1160px] items-center gap-2 px-5 py-5 sm:px-6">
          <img src={Logo} width={36} height={36} className="size-9" alt="" />
          <span className="text-lg font-bold">
            WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
          </span>
        </header>

        <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center justify-center px-5 pb-16 pt-6 text-center sm:px-6 sm:pb-20 sm:pt-8">
          <span className="grid size-16 place-items-center rounded-[18px] bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            <WifiOff className="size-7" aria-hidden="true" />
          </span>

          <h1 className="mt-7 text-balance text-[clamp(2rem,5.5vw,3.75rem)] font-black leading-[1.05] tracking-[-0.035em]">
            You are <span className="text-[var(--ink-blue)]">offline.</span>
          </h1>

          <p className="mt-5 max-w-[46ch] text-pretty text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
            WriteReady needs an internet connection to load prompts, save your writing and mark it.
            Reconnect and this screen closes by itself.
          </p>

          <div className="mt-9 flex w-full flex-col items-center gap-3">
            <button
              type="button"
              onClick={retry}
              disabled={checking}
              className="inline-flex min-h-11 w-full max-w-[280px] items-center justify-center gap-2 rounded-full bg-[var(--ink-blue-solid)] px-6 text-[0.9375rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] sm:w-auto"
            >
              {checking ? "Checking" : "Try again"}
            </button>

            <p
              role="status"
              aria-live="polite"
              className="min-h-5 text-sm text-[var(--text-secondary)]"
            >
              {checkFailed ? "Still no connection. Check your Wi-Fi or mobile data." : ""}
            </p>
          </div>
        </main>

        <footer className="mx-auto w-full max-w-[1160px] border-t border-[var(--border-color)] px-5 py-5 text-center text-sm text-[var(--text-secondary)] sm:px-6">
          Need help?{" "}
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-blue)] hover:decoration-current"
          >
            Message us on Telegram
          </a>{" "}
          once you are back online.
        </footer>
      </div>
    </div>
  );
}
