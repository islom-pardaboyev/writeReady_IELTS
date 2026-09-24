/**
 * Recovering from a deploy that landed behind an open tab.
 *
 * Every deploy renames the page files. A tab still running the previous build
 * asks for files that are no longer on the server, and the import fails
 * ("Failed to fetch dynamically imported module"). The service worker keeps
 * most old files cached, but AdminPage and CenterAdminPage are left out of its
 * cache on purpose (vite.config.ts), so the staff portals broke after every
 * deploy until the tab was closed.
 *
 * The way out is to move to the new build: switch on the service worker that
 * is waiting with it, then reload. A plain reload is not enough while the old
 * worker is in charge, because it would serve the old build again. The worker
 * is registered in 'prompt' mode so an essay in progress is never reloaded out
 * from under a student; this only runs when a page has already failed to load.
 */

const KEY = "writeready.staleReloadAt";
/** One attempt a minute, so a real outage shows its error instead of looping. */
const GUARD_MS = 60_000;

let reloading = false;

/** True while the page is on its way to the new build. The error boundary shows a short message instead of a crash. */
export function isReloadingForNewBuild(): boolean {
  return reloading;
}

/** Whether an error is a page file that could not be loaded. Each browser words it differently. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(message);
}

/** Moves to the newest build. False when it already tried in the last minute. */
export function reloadToNewestBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* no storage: still try, once, since `reloading` below stops a second try */
  }
  if (reloading) return true;
  reloading = true;
  void moveToNewestBuild();
  return true;
}

async function moveToNewestBuild(): Promise<void> {
  const reload = () => window.location.reload();
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.update().catch(() => {});
      const next = registration.waiting ?? registration.installing;
      if (next) {
        navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
        const activate = () => next.postMessage({ type: "SKIP_WAITING" });
        if (next.state === "installed") activate();
        else next.addEventListener("statechange", () => { if (next.state === "installed") activate(); });
        // Never leave the page waiting on a worker that does not answer.
        setTimeout(reload, 5000);
        return;
      }
    }
  } catch {
    /* no service worker support, or it failed: a plain reload is the best left */
  }
  reload();
}

/** Call once at start-up. Vite fires this event when a lazy page file fails to load. */
export function handleStaleBuilds(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadToNewestBuild()) event.preventDefault();
  });
}
