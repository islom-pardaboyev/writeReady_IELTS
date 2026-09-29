import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { hasUnsavedWork } from "@/hooks/useUnsavedWork";
import { moveToNewestBuild } from "@/lib/staleBuild";

/** How often an open tab asks whether a new deploy has landed. */
const CHECK_GAP_MS = 10 * 60 * 1000;

/**
 * Registers the service worker and moves an open tab to a new deploy without
 * asking: nothing is shown, and there is no button to press.
 *
 * A tab keeps running the build it was opened with until it loads again, and
 * reloading on its own would throw away an essay in progress. So once a new
 * build is waiting, the switch happens on the next link the visitor clicks:
 * that click becomes an ordinary page load of the same address, on the new
 * build. Never while a page holds unsaved essay text (useUnsavedWork), and
 * never on the app's own jumps, like the one to the feedback page after
 * submitting, which starts the AI request that a reload would cut off.
 *
 * Pages load from the network first (vite.config.ts), so a fresh visit is
 * already on the new build by the time the new worker finishes installing.
 * Then the worker is just switched on.
 */
export function AppUpdater() {
  const [waiting, setWaiting] = useState(false);

  useRegisterSW({
    onNeedRefresh() {
      void isBehind().then(setWaiting);
    },
    // The library reloads every tab once the new worker takes over. That
    // includes tabs nobody clicked in, like one with an essay open while the
    // worker was switched on from another tab. The link click does its own
    // page load, so this does nothing.
    onNeedReload() {},
    // A tab can stay open for hours: look for a new deploy now and then, and
    // when the student comes back to it, instead of only when it was opened.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      let last = Date.now();
      const check = () => {
        if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < CHECK_GAP_MS) return;
        last = Date.now();
        void registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", check);
      window.setInterval(check, CHECK_GAP_MS);
    },
  });

  useEffect(() => {
    if (!waiting) return;
    // Capture, on the document: this runs before React Router's own handler,
    // which never sees a click this takes over.
    const onClick = (e: MouseEvent) => {
      const url = pageLink(e);
      if (!url || hasUnsavedWork()) return;
      e.preventDefault();
      e.stopPropagation();
      void moveToNewestBuild(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [waiting]);

  return null;
}

/** The address of a plain left click on a link to another page of this site, else null. */
function pageLink(e: MouseEvent): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return null;
  if (a.target && a.target !== "_self") return null;
  const url = new URL(a.href);
  if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return null;
  // A jump within the same page, like the skip link.
  if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url;
}

/**
 * True when this tab runs an older build than the waiting worker. The worker's
 * file lists every file of its build, so if it names the script this page was
 * started from, the page is already current: the worker is switched on and
 * false comes back. Any doubt counts as behind.
 */
async function isBehind(): Promise<boolean> {
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
