/**
 * Whether WriteReady can be added to this device's home screen, and how.
 *
 * This lives outside React because two separate places need the same answer —
 * the banner and the header's "Download app" item — and because the browser
 * event it depends on fires once, early. A component effect that mounts a
 * moment later would simply miss it; a module listener registered at import
 * time does not.
 *
 * Two platforms, two paths. Chromium hands over a `beforeinstallprompt` event
 * that we can fire on a tap, so there the install is one button. iOS Safari
 * has no such API at all, so the only thing we can offer is the Share-menu
 * steps — which is what `install()` falls back to opening.
 */

/** Not in lib.dom: only Chromium implements it, so TypeScript ships no type. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SNOOZE_KEY = "pwaInstall.dismissedAt.v1";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * A phone or a tablet, as opposed to a laptop or a desktop.
 *
 * `pointer: coarse` asks what the *primary* pointing device is, which is the
 * question worth asking here. Screen size cannot answer it: an iPad is wider
 * than plenty of laptops. Nor can touch support: a Windows laptop with a
 * touchscreen still points with its trackpad, so it reports a fine pointer and
 * is correctly left out, while a phone or an iPad reports a coarse one.
 */
export function isHandheld(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ claims to be a Mac; only a touchscreen gives it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Chrome, Firefox and Edge on iOS have no Add to Home Screen, so the steps
  // would send those visitors looking for a menu item they do not have.
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    // Private window. Nothing was remembered, so nothing is snoozed.
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    /* nothing to remember it with — the banner comes back next visit */
  }
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = isStandalone();
let stepsOpen = false;
let bannerDismissed = false;

let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For useSyncExternalStore: a new number every time any of this changes. */
export function getVersion(): number {
  return version;
}

window.addEventListener("beforeinstallprompt", (e) => {
  // Holds back Chrome's own mini-infobar so only one offer is on screen.
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  emit();
});

window.addEventListener("appinstalled", () => {
  deferred = null;
  installed = true;
  stepsOpen = false;
  snooze();
  emit();
});

/**
 * There is somewhere to send this visitor — a real prompt, or the steps.
 *
 * Laptops and desktops are excluded deliberately, even where Chrome offers to
 * install: the home screen is the point, and on a machine that already has the
 * site one bookmark away the offer is just something else to dismiss.
 */
export function canInstall(): boolean {
  return !installed && isHandheld() && (deferred !== null || isIOSSafari());
}

/** The browser gave us an event, so the install is a single tap. */
export function canPromptDirectly(): boolean {
  return deferred !== null;
}

export function stepsVisible(): boolean {
  return stepsOpen;
}

export function bannerHidden(): boolean {
  return bannerDismissed;
}

/**
 * Chromium: opens the browser's install dialog. iOS: opens the banner with the
 * Share-menu steps, since there is no dialog to open.
 */
export async function install(): Promise<void> {
  if (!deferred) {
    stepsOpen = true;
    bannerDismissed = false;
    emit();
    return;
  }

  const event = deferred;
  // The event is single use; drop it before awaiting so a second tap while the
  // dialog is open cannot fire it twice.
  deferred = null;
  stepsOpen = false;

  // prompt() before emit(), and before any await: the browser only honours it
  // while the tap that got us here still counts as user activation, and
  // emit() re-renders half the header.
  const prompting = event.prompt();
  emit();

  await prompting;
  const { outcome } = await event.userChoice;
  // On "accepted" the appinstalled event snoozes it; this covers the other one.
  if (outcome === "dismissed") snooze();
}

export function dismissBanner(): void {
  bannerDismissed = true;
  stepsOpen = false;
  snooze();
  emit();
}
