import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** How long the note stays before it goes by itself. */
const SHOW_MS = 15_000;

/**
 * Tells a student the essay they were writing is back after the page was
 * reloaded (src/hooks/useDraft.ts), with a way to start a new one instead.
 */
export function DraftRestoredNotice({
  savedAt,
  onStartOver,
  onDismiss,
}: {
  savedAt: number | null;
  onStartOver: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (savedAt === null) return;
    const t = window.setTimeout(onDismiss, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [savedAt, onDismiss]);

  if (savedAt === null) return null;
  const saved = new Date(savedAt);
  const today = saved.toDateString() === new Date().toDateString();
  const when = saved.toLocaleString(undefined, today
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const startOver = () => {
    if (window.confirm("Delete this essay and start a new one?")) onStartOver();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-4 pr-2 text-[var(--text-primary)] shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      >
        <p className="min-w-0 flex-1 text-sm leading-snug">
          Your essay is back, as it was at {when}.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={startOver} className="shrink-0">
          Start over
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
