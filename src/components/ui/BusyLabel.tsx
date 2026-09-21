import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** A button's label while it works: a spinner and `busyText` instead of `children`. */
export function BusyLabel({ busy, busyText, children }: { busy: boolean; busyText: string; children: ReactNode }) {
  if (!busy) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {busyText}
    </span>
  );
}
