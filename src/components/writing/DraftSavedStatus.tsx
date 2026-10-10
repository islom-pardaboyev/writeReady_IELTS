import { Check, TriangleAlert } from "lucide-react";

/**
 * Sits beside the word count and tells the student their essay is kept in
 * this browser (src/hooks/useDraft.ts), so a reload or a closed laptop does
 * not cost them the essay. Says so plainly when the browser would not keep it.
 */
export function DraftSavedStatus({ pending, savedAt }: { pending: boolean; savedAt: number | null | false }) {
  if (pending && savedAt !== false) {
    return (
      <span role="status" className="text-xs text-slate-500 dark:text-neutral-400">
        Saving…
      </span>
    );
  }
  if (savedAt === null) return null;

  if (savedAt === false) {
    return (
      <span
        role="status"
        title="This browser is not letting WriteReady save your draft. Keep this tab open until you get feedback."
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"
      >
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        Not saved
      </span>
    );
  }

  const time = new Date(savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      role="status"
      title={`Your draft is saved in this browser (${time}). It comes back if the page reloads.`}
      className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400"
    >
      <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      {/* On a phone the tick alone keeps the status bar on one line. */}
      <span className="max-sm:sr-only">Saved</span>
    </span>
  );
}
