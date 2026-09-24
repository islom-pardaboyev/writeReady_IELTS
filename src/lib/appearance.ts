import { useLayoutEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router";

// The student's accent colour: the ink for buttons, links, selection and focus
// on the student side of the site. Saved in this browser only, like the theme.
//
// The colours live in src/index.css under [data-accent]. Indigo is the brand
// colour and sets no attribute at all, so the default site is untouched.
// index.html repeats the stored-value check so the colour paints before React
// loads; keep its list of ids and staff paths in step with this file.

export type AccentId = "indigo" | "ocean" | "teal" | "violet" | "berry" | "graphite";

export interface Accent {
  id: AccentId;
  label: string;
  /**
   * The accent's ink in light mode, from src/index.css (--acc-600; --acc-800
   * for graphite). Shown on the picker swatch and in a phone's browser bar.
   */
  swatch: string;
  /** The same ink in dark mode (--acc-400; --acc-200 for graphite). */
  swatchDark: string;
}

// Change a colour here and in src/index.css together.
export const ACCENTS: Accent[] = [
  { id: "indigo", label: "Indigo", swatch: "#4f46e5", swatchDark: "#818cf8" },
  { id: "ocean", label: "Ocean", swatch: "#006da5", swatchDark: "#00a3dd" },
  { id: "teal", label: "Teal", swatch: "#00776d", swatchDark: "#00ae9c" },
  { id: "violet", label: "Violet", swatch: "#7239d8", swatchDark: "#9b82e7" },
  { id: "berry", label: "Berry", swatch: "#ba0060", swatchDark: "#eb55a8" },
  { id: "graphite", label: "Graphite", swatch: "#1d293d", swatchDark: "#d4d4d4" },
];

export const DEFAULT_ACCENT: AccentId = "indigo";

const STORAGE_KEY = "accent";

// The staff portals always keep the brand indigo: PRODUCT.md binds them to one
// design, and a teacher on a shared computer should not inherit a student's colour.
const STAFF_PATH = /^\/(admin|center-admin|teacher-portal)(\/|$)/;

const isAccentId = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

function readAccent(): AccentId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isAccentId(stored) ? stored : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

let accent = readAccent();
const listeners = new Set<() => void>();

export function setAccent(next: AccentId) {
  accent = next;
  try {
    if (next === DEFAULT_ACCENT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or storage blocked: the colour still applies until reload.
  }
  listeners.forEach((l) => l());
}

// Another tab changed the colour.
const onStorage = (e: StorageEvent) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  accent = readAccent();
  listeners.forEach((l) => l());
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export const useAccent = () => useSyncExternalStore(subscribe, () => accent);

function paintAccent(id: AccentId) {
  const root = document.documentElement;
  if (id === DEFAULT_ACCENT) root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", id);

  // The light-mode browser bar on phones follows the ink too. The dark one is
  // a neutral page colour and stays as it is.
  const swatch = ACCENTS.find((a) => a.id === id)?.swatch ?? ACCENTS[0].swatch;
  document
    .querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
    ?.setAttribute("content", swatch);
}

/**
 * Keeps <html data-accent> in step with the saved colour and the current page.
 * Rendered once, inside the router. A layout effect, so moving from a student
 * page to a staff portal never shows one frame in the student's colour.
 */
export function AccentPainter() {
  const { pathname } = useLocation();
  const chosen = useAccent();
  const id = STAFF_PATH.test(pathname) ? DEFAULT_ACCENT : chosen;
  useLayoutEffect(() => paintAccent(id), [id]);
  return null;
}
