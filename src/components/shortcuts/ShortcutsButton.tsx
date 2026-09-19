import { Keyboard } from "lucide-react";
import { openShortcutsHelp } from "@/lib/shortcuts";

/** Opens the keyboard shortcut list. Hidden on touch-only devices. */
export function ShortcutsButton() {
  return (
    <button
      type="button"
      onClick={openShortcutsHelp}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      className="hidden pointer-fine:inline-flex w-9 h-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)]"
    >
      <Keyboard className="w-4 h-4" />
    </button>
  );
}
