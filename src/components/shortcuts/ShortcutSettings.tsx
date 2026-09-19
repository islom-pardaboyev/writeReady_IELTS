import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  ALT_LABEL,
  checkRecordedKey,
  formatShortcut,
  openShortcutsHelp,
  resetShortcuts,
  setRecordingShortcut,
  setShortcut,
  SHORTCUT_ACTIONS,
  type ShortcutId,
  useShortcutBindings,
} from "@/lib/shortcuts";
import { ShortcutKeys } from "./ShortcutKeys";

/**
 * The "Keyboard shortcuts" card on My Account. Click a shortcut, then press
 * the new keys; Escape cancels. Hidden on touch-only devices, which have no
 * keyboard to use them with.
 */
export function ShortcutSettings({ className = "" }: { className?: string }) {
  const bindings = useShortcutBindings();
  const { hash } = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [message, setMessage] = useState<{ id: ShortcutId; text: string; error: boolean } | null>(null);
  const changed = SHORTCUT_ACTIONS.some((a) => bindings[a.id] !== a.defaultCode);

  useEffect(() => {
    setRecordingShortcut(recordingId !== null);
    return () => setRecordingShortcut(false);
  }, [recordingId]);

  // Arriving from "Change shortcuts" in the shortcut list.
  useEffect(() => {
    if (hash === "#shortcuts") cardRef.current?.scrollIntoView({ block: "start" });
  }, [hash]);

  const record = (id: ShortcutId) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Tab") {
      setRecordingId(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecordingId(null);
      setMessage(null);
      return;
    }
    const result = checkRecordedKey(e.nativeEvent, id, bindings);
    if (result.status === "waiting") return;
    if (result.status === "error") {
      setMessage({ id, text: result.message, error: true });
      return;
    }
    setShortcut(id, result.code);
    setRecordingId(null);
    setMessage({ id, text: `Saved. ${formatShortcut(result.code)} now works on every page.`, error: false });
  };

  return (
    <Card id="shortcuts" ref={cardRef} className={`hidden pointer-fine:block scroll-mt-6 p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="font-sans font-bold text-lg text-[var(--text-primary)]">Keyboard shortcuts</div>
        <button
          type="button"
          onClick={openShortcutsHelp}
          className="shrink-0 text-sm font-medium text-[var(--ink-blue)] bg-transparent border-none cursor-pointer hover:underline p-0 mt-1"
        >
          Show list
        </button>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        Hold {ALT_LABEL} and press a key to jump around the site, even while you're writing. To change one, click
        it and press your new keys. Press <ShortcutKeys keys={["?"]} /> on any page to see them all.
      </p>

      <ul>
        {SHORTCUT_ACTIONS.map((a) => {
          const code = bindings[a.id];
          const isRecording = recordingId === a.id;
          const note = message?.id === a.id ? message : null;
          return (
            <li key={a.id} className="border-t border-[var(--border-color)] py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">{a.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setRecordingId(isRecording ? null : a.id);
                  }}
                  onKeyDown={isRecording ? record(a.id) : undefined}
                  onBlur={() => isRecording && setRecordingId(null)}
                  aria-label={
                    isRecording
                      ? `Press the new shortcut for ${a.label}, or Escape to cancel`
                      : `Change shortcut for ${a.label}. Now ${code ? formatShortcut(code) : "off"}`
                  }
                  className={`inline-flex items-center justify-center min-w-[7.5rem] h-10 px-2 rounded-lg border bg-[var(--bg-card)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)] ${
                    isRecording
                      ? "border-[var(--ink-blue)] ring-2 ring-[var(--ink-blue)]/25"
                      : "border-[var(--border-color)] hover:border-[var(--ink-blue)]"
                  }`}
                >
                  {isRecording ? (
                    <span className="text-xs font-semibold text-[var(--ink-blue)]">Press keys…</span>
                  ) : code ? (
                    <ShortcutKeys code={code} />
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">Off: click to set</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShortcut(a.id, null);
                    setMessage(null);
                  }}
                  disabled={!code || isRecording}
                  aria-label={`Turn off shortcut for ${a.label}`}
                  title="Turn off"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border-none bg-transparent text-[var(--text-secondary)] cursor-pointer transition-colors hover:bg-[var(--bg-subtle)] hover:text-red-600 disabled:opacity-0 disabled:pointer-events-none"
                >
                  <X size={15} />
                </button>
              </div>
              {note && (
                <p
                  className={`text-xs mt-1.5 ${note.error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                >
                  {note.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="sr-only" aria-live="polite">
        {message?.text}
      </p>

      {changed && (
        <div className="border-t border-[var(--border-color)] pt-3">
          <button
            type="button"
            onClick={() => {
              resetShortcuts();
              setRecordingId(null);
              setMessage(null);
            }}
            className="text-sm font-medium text-[var(--text-secondary)] bg-transparent border-none cursor-pointer hover:text-[var(--text-primary)] hover:underline p-0"
          >
            Reset all to defaults
          </button>
        </div>
      )}
    </Card>
  );
}
