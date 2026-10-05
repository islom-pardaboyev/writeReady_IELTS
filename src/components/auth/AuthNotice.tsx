import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/** An error from the server above a sign-in form: the Notice from DESIGN.md, announced as an alert. */
export function AuthNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
