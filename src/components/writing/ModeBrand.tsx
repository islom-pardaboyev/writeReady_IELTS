import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface ModeBrandProps {
  /** Name of the mode, e.g. "Mock Exam". */
  label: string;
  /** Optional third crumb, e.g. "Task 2 setup". */
  sub?: ReactNode;
  /** Asks about unsaved work; it calls preventDefault when the user stays. */
  confirmLeave?: (e: MouseEvent) => void;
}

/**
 * Top-left "‹ WriteReady › Mode" control shared by every writing mode.
 * It inherits the bar's text colour, so it stays readable on any background.
 */
export function ModeBrand({ label, sub, confirmLeave }: ModeBrandProps) {
  const navigate = useNavigate();

  const handleBack = (e: MouseEvent) => {
    confirmLeave?.(e);
    if (e.defaultPrevented) return;
    // Going back only works when the user came from inside the app; a direct
    // link or a fresh tab has nowhere to return to, so send them to the dashboard.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/dashboard");
  };

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={handleBack}
        title="Back to WriteReady"
        className="-ml-2 inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-md text-[0.7rem] font-semibold uppercase tracking-[0.14em] opacity-60 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500 sm:-ml-1.5 sm:size-auto sm:px-1.5 sm:py-1 dark:hover:bg-white/10"
      >
        <ChevronLeftIcon strokeWidth={3} aria-hidden="true" className="size-3.5" />
        <span className="hidden sm:inline">WriteReady</span>
        <span className="sr-only sm:hidden">Back to WriteReady</span>
      </button>
      <ChevronRightIcon aria-hidden="true" className="hidden size-3 shrink-0 opacity-30 sm:block" />
      <span className="truncate text-sm font-medium">{label}</span>
      {sub && (
        <>
          <ChevronRightIcon aria-hidden="true" className="hidden size-3 shrink-0 opacity-30 sm:block" />
          <span className="hidden truncate text-sm opacity-60 sm:block">{sub}</span>
        </>
      )}
    </nav>
  );
}
