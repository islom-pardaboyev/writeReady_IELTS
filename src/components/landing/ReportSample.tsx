import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// A report as it comes back, shortened: the bands, one sentence note and one
// word. Sample content, labelled as such. It is the white sheet on the indigo
// field beside the sign-in form (src/components/auth/AuthAside.tsx), which
// must never make that page scroll: on a short screen the word, then the
// sentence note, drop out.
export function ReportSample({ className, captionClassName }: { className?: string; captionClassName?: string }) {
  const bands: [string, number][] = [
    ['Task Response', 6.5],
    ['Coherence and Cohesion', 7],
    ['Lexical Resource', 6.5],
    ['Grammatical Range and Accuracy', 6],
  ];
  return (
    <figure className={cn('m-0', className)}>
      <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] text-left shadow-[0_24px_48px_-20px_rgb(10_8_60/0.6)]">
        <div className="flex items-end justify-between gap-4 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-[var(--text-secondary)]">Task 2 · Opinion essay</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">Estimated overall band</p>
          </div>
          <p className="font-mono text-4xl font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)] tabular-nums">6.5</p>
        </div>
        <dl className="m-0 grid gap-px bg-[var(--border-color)] sm:grid-cols-2">
          {bands.map(([name, band]) => (
            <div key={name} className="bg-[var(--bg-card)] px-5 py-3">
              <dt className="text-xs text-[var(--text-secondary)]">{name}</dt>
              <dd className="m-0 mt-1 flex items-center gap-3">
                <span className="font-mono text-lg font-semibold text-[var(--text-primary)] tabular-nums">{band.toFixed(1)}</span>
                <span aria-hidden="true" className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
                  <span className="block h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(band / 9) * 100}%` }} />
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-[var(--border-color)] px-5 py-4 [@media(max-height:740px)]:hidden">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Sentence 2 · Grammar</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-primary)]">
            <span className="text-red-600 line-through decoration-1 dark:text-red-400">Technology have changed</span> the way we learn.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Technology has changed</span> the way we learn.
          </p>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">"Technology" is one thing, so the verb is singular.</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--border-color)] px-5 py-4 [@media(max-height:860px)]:hidden">
          <p className="w-full text-xs font-semibold text-[var(--text-secondary)]">Better word</p>
          <p className="text-sm text-[var(--text-secondary)]">dramatically</p>
          <ArrowRight className="size-3.5 translate-y-0.5 text-[var(--text-secondary)]" aria-hidden="true" />
          <span className="sr-only">becomes</span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">profoundly</p>
          <p className="text-sm text-[var(--text-secondary)]">Uzbek: tubdan</p>
        </div>
      </div>
      <figcaption className={cn('mt-3 text-center text-xs text-[var(--text-secondary)]', captionClassName)}>Part of a sample report</figcaption>
    </figure>
  );
}
