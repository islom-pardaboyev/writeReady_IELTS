import { useEffect, useState } from "react";

function relative(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1_000)}s ago`;
  return `${Math.round(diff / 60_000)}m ago`;
}

/**
 * A quiet "Saving…" / "Saved ✓" next to the word count, so a student never
 * has to wonder whether the essay they just wrote is still there
 * (src/hooks/useDraft.ts). Says nothing until the first save actually
 * happens — a draft that was never written has nothing to report yet.
 */
export function DraftSavedIndicator({ pending, savedAt }: { pending: boolean; savedAt: number | null }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (savedAt === null || pending) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [savedAt, pending]);

  if (pending) {
    return <span className="text-xs text-slate-400 dark:text-neutral-500">Saving…</span>;
  }
  if (savedAt === null) return null;
  return (
    <span
      className="text-xs text-slate-400 dark:text-neutral-500"
      title="Saved on this device as you write"
    >
      Saved <span className="text-emerald-500">✓</span> {relative(savedAt)}
    </span>
  );
}
