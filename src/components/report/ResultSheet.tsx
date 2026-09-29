import { useEffect, useState, type ReactNode } from 'react';
import { Info, TrendingUp } from 'lucide-react';
import { Meter } from '../profile/parts';

// The top of the feedback report, laid out like an examiner's result sheet:
// the question, the four criteria with their bands and the reason for each,
// the overall band beside them, and what the next band needs.

export interface SheetCriterion {
  key: string;
  name: string;
  band: number;
  /** One line on why the band is what it is; empty on a free report. */
  reason?: string;
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
  words,
  bandGap,
}: {
  question: ReactNode;
  criteria: SheetCriterion[];
  overall: number;
  descriptor: string;
  words: number;
  bandGap?: string;
}) {
  return (
    <section aria-label="Your result" className="overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border-color)] px-5 py-5 sm:px-6">{question}</div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_15rem]">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Band for each criterion</caption>
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th scope="col" className="px-5 py-2.5 text-xs font-medium text-[var(--text-secondary)] sm:px-6">Criterion</th>
              <th scope="col" className="w-28 px-5 py-2.5 text-right text-xs font-medium text-[var(--text-secondary)] sm:w-36 sm:px-6">Band</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.key} className="border-b border-[var(--border-color)] last:border-b-0">
                <th scope="row" className="px-5 py-4 align-top font-normal sm:px-6">
                  <span className="block text-base font-semibold text-[var(--text-primary)]">{c.name}</span>
                  {c.reason && (
                    <span className="mt-1 line-clamp-2 block max-w-[62ch] text-sm leading-relaxed text-[var(--text-secondary)]">{c.reason}</span>
                  )}
                </th>
                <td className="px-5 py-4 align-top sm:px-6">
                  <span className="block text-right font-mono text-2xl font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)] tabular-nums">
                    {c.band.toFixed(1)}
                  </span>
                  <span className="mt-2.5 block">
                    <Meter value={c.band / 9} label={`${c.name}: band ${c.band.toFixed(1)} of 9`} className={bandBar(c.band)} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* First on a phone, where the student looks for the one number; beside the table from 1024px. */}
        <div className="order-first flex flex-col justify-center border-b border-[var(--border-color)] bg-[var(--bg-base)] px-5 py-6 sm:px-6 lg:order-none lg:border-b-0 lg:border-l">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Overall band</p>
          {/* The ± sits on the number itself: the band is an estimate, and it must never read as exact. */}
          <p className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-6xl font-semibold leading-none tracking-[-0.045em] text-[var(--text-primary)]">{overall.toFixed(1)}</span>
            <span className="text-2xl font-semibold leading-none tracking-[-0.02em] text-[var(--text-secondary)]">
              ±0.5<span className="sr-only"> (plus or minus half a band)</span>
            </span>
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{descriptor}</p>
          {/* Said in plain words, in a box of its own, right under the number: a student who reads only the band must still see it. */}
          <div role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            <p className="m-0 text-xs leading-relaxed text-[var(--text-secondary)]">
              <strong className="font-semibold text-[var(--text-primary)]">This score may not be 100% accurate.</strong>{' '}
              It is an AI estimate, so your real band can be half a band higher or lower.
            </p>
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            <span className="font-mono tabular-nums">{words}</span> words
          </p>
        </div>
      </div>

      {bandGap && (
        <div className="flex items-start gap-3 border-t border-[var(--border-color)] px-5 py-4 sm:px-6">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-[var(--gold)]" aria-hidden="true" />
          <p className="m-0 text-base leading-relaxed text-[var(--text-primary)]">{bandGap}</p>
        </div>
      )}
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
