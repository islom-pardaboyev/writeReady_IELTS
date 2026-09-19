import { useSyncExternalStore } from "react";

// Keyboard shortcuts a student can set for themselves. Every shortcut is Alt
// (Option on a Mac) plus one key:
// - it can't fire by accident while typing an essay, so shortcuts also work
//   with the cursor in the answer box;
// - Ctrl and Cmd combinations stay with the browser, and Shift is left out
//   because Alt+Shift switches the keyboard language on many Windows PCs.
// Keys are matched by their position on the keyboard (KeyboardEvent.code), so a
// shortcut keeps working after switching to a Cyrillic layout, and Option+L on
// a Mac (which types "¬") still reads as L. Choices are saved in this browser
// only, like the theme.

export type ShortcutId =
  | "toggleTheme"
  | "openMock"
  | "openPractice"
  | "openQuick"
  | "openRelax"
  | "goHome"
  | "toggleAssistant";

export interface ShortcutAction {
  id: ShortcutId;
  label: string;
  /** Where the shortcut navigates, for the navigation shortcuts. */
  path?: string;
  defaultCode: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: "toggleTheme", label: "Switch dark / light mode", defaultCode: "KeyL" },
  { id: "openMock", label: "Open Mock Exam", path: "/writing/mock", defaultCode: "KeyM" },
  { id: "openPractice", label: "Open Practice Mode", path: "/writing/practice", defaultCode: "KeyP" },
  { id: "openQuick", label: "Open Quick Write", path: "/writing/quick", defaultCode: "KeyQ" },
  { id: "openRelax", label: "Open Relax Mode", path: "/writing/relax", defaultCode: "KeyR" },
  { id: "goHome", label: "Go to the home page", path: "/", defaultCode: "KeyW" },
  { id: "toggleAssistant", label: "Open or close the AI assistant", defaultCode: "KeyA" },
];

export type ShortcutBindings = Record<ShortcutId, string | null>;

// ── Keys ────────────────────────────────────────────────────────────────────

const PUNCTUATION: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Backquote: "`",
};

// Alt+D, E and F jump to the address bar and menus in Chrome and Edge on
// Windows; Alt+B, H, S, T and V open Firefox's menus there.
const BROWSER_KEYS = new Set(["KeyD", "KeyE", "KeyF", "KeyB", "KeyH", "KeyS", "KeyT", "KeyV"]);

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const ALT_LABEL = IS_MAC ? "Option" : "Alt";

const isAllowedCode = (code: string) => /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || code in PUNCTUATION;

export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return PUNCTUATION[code] ?? code;
}

export const formatShortcut = (code: string) => `${ALT_LABEL}+${keyLabel(code)}`;

// Some on-screen keyboards and remote-desktop tools send key events without a
// code; fall back to the character when it names the key plainly.
function eventCode(e: KeyboardEvent): string {
  if (e.code) return e.code;
  if (/^[a-z]$/i.test(e.key)) return `Key${e.key.toUpperCase()}`;
  if (/^[0-9]$/.test(e.key)) return `Digit${e.key}`;
  return Object.keys(PUNCTUATION).find((c) => PUNCTUATION[c] === e.key) ?? "";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}

/** The action a keydown triggers, if any. */
export function matchShortcut(e: KeyboardEvent, bindings: ShortcutBindings): ShortcutAction | undefined {
  // AltGr arrives as Ctrl+Alt, so characters typed with it never match.
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return undefined;
  const code = eventCode(e);
  return code ? SHORTCUT_ACTIONS.find((a) => bindings[a.id] === code) : undefined;
}

export type RecordResult =
  | { status: "waiting" }
  | { status: "error"; message: string }
  | { status: "ok"; code: string };

/** Checks a key press made while recording a new shortcut for `id`. */
export function checkRecordedKey(e: KeyboardEvent, id: ShortcutId, bindings: ShortcutBindings): RecordResult {
  if (["Alt", "AltGraph", "Shift", "Control", "Meta", "CapsLock"].includes(e.key)) return { status: "waiting" };
  if (!e.altKey) return { status: "error", message: `Hold ${ALT_LABEL} and press a letter or number.` };
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    return {
      status: "error",
      message: `Use only ${ALT_LABEL} with the key, without Shift, Ctrl${IS_MAC ? " or Cmd" : ""}.`,
    };
  }
  const code = eventCode(e);
  if (!isAllowedCode(code)) return { status: "error", message: "Pick a letter, number or punctuation key." };
  if (BROWSER_KEYS.has(code)) {
    return { status: "error", message: `Some browsers use ${formatShortcut(code)} themselves. Pick another key.` };
  }
  const taken = SHORTCUT_ACTIONS.find((a) => a.id !== id && bindings[a.id] === code);
  if (taken) return { status: "error", message: `${formatShortcut(code)} is already set for "${taken.label}".` };
  return { status: "ok", code };
}

// ── Saved choices ───────────────────────────────────────────────────────────
// Only changes from the defaults are stored, as { id: code } or { id: null }
// for a shortcut that's turned off.

const STORAGE_KEY = "shortcuts";

function readOverrides(): Partial<ShortcutBindings> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Partial<ShortcutBindings>) : {};
  } catch {
    return {};
  }
}

function resolve(overrides: Partial<ShortcutBindings>): ShortcutBindings {
  const out = {} as ShortcutBindings;
  for (const a of SHORTCUT_ACTIONS) {
    const o = overrides[a.id];
    out[a.id] = o === null ? null : typeof o === "string" && isAllowedCode(o) ? o : a.defaultCode;
  }
  return out;
}

let overrides = readOverrides();
let bindings = resolve(overrides);
const listeners = new Set<() => void>();

function commit(next: Partial<ShortcutBindings>) {
  overrides = next;
  bindings = resolve(next);
  try {
    if (Object.keys(next).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or storage blocked: the change still applies until reload.
  }
  listeners.forEach((l) => l());
}

export function setShortcut(id: ShortcutId, code: string | null) {
  const next = { ...overrides };
  const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
  if (code === action?.defaultCode) delete next[id];
  else next[id] = code;
  commit(next);
}

export const resetShortcuts = () => commit({});

// Another tab changed the shortcuts.
const onStorage = (e: StorageEvent) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  overrides = readOverrides();
  bindings = resolve(overrides);
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

export const useShortcutBindings = () => useSyncExternalStore(subscribe, () => bindings);

// ── Talking to the rest of the app ──────────────────────────────────────────

// True while the settings card is waiting for a new key, so the global
// listener doesn't also run whatever that key is bound to.
let recording = false;
export const setRecordingShortcut = (value: boolean) => {
  recording = value;
};
export const isRecordingShortcut = () => recording;

export const SHORTCUTS_HELP_EVENT = "writeready:shortcuts-help";
export const TOGGLE_ASSISTANT_EVENT = "writeready:toggle-assistant";

export const openShortcutsHelp = () => window.dispatchEvent(new Event(SHORTCUTS_HELP_EVENT));

/** Opens or closes the AI assistant. False when this page doesn't have one. */
export const toggleAssistant = () =>
  !window.dispatchEvent(new Event(TOGGLE_ASSISTANT_EVENT, { cancelable: true }));
