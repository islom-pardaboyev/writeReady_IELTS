import { useSyncExternalStore, type CSSProperties } from "react";

// How the student's own answer looks while they write: text size, font and
// line spacing, plus the plain "exam look" for Mock Exam. Every writing mode
// reads the same settings, so a change in one mode or on My Account shows up
// everywhere. Saved in this browser only, like the theme and the shortcuts.

export type TextSize = "s" | "m" | "l" | "xl";
export type WritingFont = "sans" | "serif" | "exam";
export type LineSpacing = "compact" | "normal" | "relaxed";

export interface WritingSettings {
  size: TextSize;
  font: WritingFont;
  spacing: LineSpacing;
  /** Mock Exam only: Arial and a black-and-white screen instead of the accent. */
  examLook: boolean;
}

export const TEXT_SIZES: { id: TextSize; label: string; px: number }[] = [
  { id: "s", label: "Small", px: 14 },
  { id: "m", label: "Medium", px: 16 },
  { id: "l", label: "Large", px: 18 },
  { id: "xl", label: "Extra large", px: 20 },
];

export const WRITING_FONTS: { id: WritingFont; label: string; hint: string; family: string }[] = [
  { id: "sans", label: "Sans", hint: "Inter, the site's own font.", family: '"Inter", sans-serif' },
  {
    id: "serif",
    label: "Serif",
    hint: "Source Serif, a calm book font for long answers.",
    family: '"Source Serif 4", Georgia, "Times New Roman", serif',
  },
  { id: "exam", label: "Arial", hint: "Plain Arial, simple and familiar.", family: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
];

export const LINE_SPACINGS: { id: LineSpacing; label: string; value: number }[] = [
  { id: "compact", label: "Compact", value: 1.5 },
  { id: "normal", label: "Normal", value: 1.7 },
  { id: "relaxed", label: "Relaxed", value: 2 },
];

export const DEFAULT_WRITING: WritingSettings = {
  size: "m",
  font: "sans",
  spacing: "normal",
  examLook: false,
};

const STORAGE_KEY = "writingSettings";

const pick = <T extends string>(options: { id: T }[], value: unknown, fallback: T): T =>
  options.some((o) => o.id === value) ? (value as T) : fallback;

// A hand-edited or older saved value never breaks the editor: anything unknown
// falls back to its default, one field at a time.
function readSettings(): WritingSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      size: pick(TEXT_SIZES, s.size, DEFAULT_WRITING.size),
      font: pick(WRITING_FONTS, s.font, DEFAULT_WRITING.font),
      spacing: pick(LINE_SPACINGS, s.spacing, DEFAULT_WRITING.spacing),
      examLook: s.examLook === true,
    };
  } catch {
    return DEFAULT_WRITING;
  }
}

let settings = readSettings();
const listeners = new Set<() => void>();

function commit(next: WritingSettings) {
  settings = next;
  try {
    if (isDefaultWriting(next)) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage blocked: the change still applies until reload.
  }
  listeners.forEach((l) => l());
}

export const updateWritingSettings = (patch: Partial<WritingSettings>) => commit({ ...settings, ...patch });
export const resetWritingSettings = () => commit(DEFAULT_WRITING);

export const isDefaultWriting = (s: WritingSettings) =>
  s.size === DEFAULT_WRITING.size &&
  s.font === DEFAULT_WRITING.font &&
  s.spacing === DEFAULT_WRITING.spacing &&
  s.examLook === DEFAULT_WRITING.examLook;

// Another tab changed the settings.
const onStorage = (e: StorageEvent) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  settings = readSettings();
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

export const useWritingSettings = () => useSyncExternalStore(subscribe, () => settings);

/**
 * Inline style for an answer box. `examLook` is true only on the Mock Exam
 * screen with the exam look on, where Arial replaces the chosen font.
 */
export function answerTextStyle(s: WritingSettings, examLook = false): CSSProperties {
  const size = TEXT_SIZES.find((t) => t.id === s.size) ?? TEXT_SIZES[1];
  const spacing = LINE_SPACINGS.find((l) => l.id === s.spacing) ?? LINE_SPACINGS[1];
  const font = WRITING_FONTS.find((f) => f.id === (examLook ? "exam" : s.font)) ?? WRITING_FONTS[0];
  return { fontSize: `${size.px}px`, lineHeight: spacing.value, fontFamily: font.family };
}
