import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Info, TrendingUp } from 'lucide-react';
import { Meter } from '../profile/parts';

// The top of the feedback report (.impeccable/surfaces/src-pages-feedbackpage-tsx.md):
// the overall band first, the four criteria in one row of tiles under it, what
// the next band needs, and the question folded away. The reason behind each
// band is in the report's "By criterion" tab, not here.

export interface SheetCriterion {
  key: string;
  name: string;
  band: number;
}

// The report's own band colours (DESIGN.md: gold marks the high bands here).
function bandBar(band: number) {
  return band >= 7 ? 'bg-amber-400' : band >= 6 ? 'bg-[var(--ink-blue)]' : 'bg-rose-500';
}

export function ResultSheet({
  question,
  criteria,
  overall,
  descriptor,
  bandGap,
}: {
  question: ReactNode;
  criteria: SheetCriterion[];
  overall: number;
  descriptor: string;
  bandGap?: string;
}) {
  return (
    <section aria-label="Your result" className="overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 px-5 pb-6 pt-6 sm:px-7">
        <div>
          <p className="m-0 text-sm font-medium text-[var(--text-secondary)]">Estimated overall band</p>
          {/* The ± sits on the number itself: the band is an estimate, and it must never read as exact. */}
          <p className="m-0 mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-[4rem] font-semibold leading-none tracking-[-0.045em] text-[var(--text-primary)]">{overall.toFixed(1)}</span>
            <span className="text-2xl font-semibold leading-none text-[var(--text-secondary)]">
              ±0.5<span className="sr-only"> (plus or minus half a band)</span>
            </span>
          </p>
        </div>
        <div className="pb-1 sm:max-w-[28rem] sm:text-right">
          <p className="m-0 text-lg font-semibold text-[var(--text-primary)]">{descriptor}</p>
          {/* Right beside the number, so a student who reads only the band still sees it. */}
          <p role="note" className="m-0 mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--text-secondary)] sm:justify-end">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            AI estimate: your real band can be half a band higher or lower.
          </p>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-px border-t border-[var(--border-color)] bg-[var(--border-color)] lg:grid-cols-4">
        {criteria.map((c) => (
          <div key={c.key} className="flex flex-col justify-between gap-3 bg-[var(--bg-card)] px-5 py-4 sm:px-6">
            <dt className="text-sm leading-snug text-[var(--text-secondary)]">{c.name}</dt>
            <dd className="m-0 flex items-center gap-3">
              <span className="font-mono text-2xl font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)] tabular-nums">
                {c.band.toFixed(1)}
              </span>
              <span className="flex-1">
                <Meter value={c.band / 9} label={`${c.name}: band ${c.band.toFixed(1)} of 9`} className={bandBar(c.band)} />
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {bandGap && (
        <div className="flex items-start gap-3 border-t border-[var(--border-color)] px-5 py-4 sm:px-7">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-[var(--gold)]" aria-hidden="true" />
          <p className="m-0 text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">{bandGap}</p>
        </div>
      )}

      {/* Folded away: the student has just written it. */}
      <details className="group border-t border-[var(--border-color)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-7 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show the question</span>
          <span className="hidden group-open:inline">Hide the question</span>
          <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="px-5 pb-5 sm:px-7">{question}</div>
      </details>
    </section>
  );
}

function readDone(key: string, count: number): boolean[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.from({ length: count }, (_, i) => saved[i] === true);
  } catch {
    return Array.from({ length: count }, () => false);
  }
}

/**
 * The report's three priority fixes as a checklist. Ticks are remembered on
 * this device for this report and task, and nowhere else.
 */
export function FixChecklist({ fixes, storageKey }: { fixes: string[]; storageKey: string }) {
  const [done, setDone] = useState<boolean[]>(() => readDone(storageKey, fixes.length));
  useEffect(() => setDone(readDone(storageKey, fixes.length)), [storageKey, fixes.length]);

  const toggle = (i: number) => {
    setDone((prev) => {
      const next = prev.map((d, j) => (j === i ? !d : d));
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* private window or storage full: the tick lasts for this visit */
      }
      return next;
    });
  };

  if (fixes.length === 0) return null;
  const count = done.filter(Boolean).length;

  return (
    <section aria-labelledby="fp-fixes" className="mt-6 overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-3 pt-5 sm:px-6">
        <h2 id="fp-fixes" className="text-lg font-bold text-[var(--text-primary)]">Fix these first</h2>
        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
          <span className="font-mono tabular-nums">{count}</span> of {fixes.length} done
        </p>
      </div>
      <ol className="m-0 list-none p-0">
        {fixes.map((fix, i) => (
          <li key={i} className="border-t border-[var(--border-color)]">
            <label className="flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors duration-150 hover:bg-[var(--bg-base)] sm:px-6">
              <input
                type="checkbox"
                checked={done[i] ?? false}
                onChange={() => toggle(i)}
                className="mt-1 size-[18px] shrink-0 cursor-pointer accent-[var(--ink-blue)]"
              />
              <span className="min-w-0">
                {i === 0 && <span className="mb-0.5 block text-xs font-semibold text-[var(--ink-blue)]">Start here</span>}
                <span
                  className={`block text-base leading-relaxed transition-colors duration-200 ${
                    done[i] ? 'text-[var(--text-secondary)] line-through decoration-1' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {fix}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ol>
    </section>
  );
}
