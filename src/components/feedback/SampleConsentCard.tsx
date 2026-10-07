import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Check, Gift, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { EnhancedFeedbackResult } from '@/types';
import type { ReportData } from '@/lib/reportEncoding';
import { MIN_SAMPLE_BAND, fmtBand as fmt } from '@/lib/questionData';
import { fetchOffer, sendConsent, sessionTasks, type Offer, type SampleTask } from '@/lib/sampleConsent';

/**
 * "🎉 Band 7+! Can we show your essay anonymously as a sample answer?"
 *
 * Shown under the result once every report the page is writing has finished,
 * and only for essays the server says may be offered: Band 7+ on a bank
 * question, never answered before (api/_lib/samples/consent.ts). A Mock or
 * Practice test with two such tasks gets one card with a checkbox for each.
 */
const label = (t: SampleTask) => (t === 'task1' ? 'Task 1' : 'Task 2');

export function SampleConsentCard({
  reportData,
  feedbacks,
  loadings,
  onAnswered,
}: {
  reportData: ReportData;
  feedbacks: Record<string, EnhancedFeedbackResult>;
  loadings: Record<string, boolean>;
  /** After a "yes", so the page can show the new free assessment. */
  onAnswered?: () => void;
}) {
  const mode = reportData.mode;
  const tasks = useMemo(() => sessionTasks(reportData), [reportData]);
  const busy = Object.values(loadings).some(Boolean);
  // The tasks worth asking the server about: 7+ on this page. The server
  // checks again from its own records; this only saves a needless request.
  const candidates = (['task1', 'task2'] as const)
    .filter((t) => (feedbacks[t]?.scores.overall ?? 0) >= MIN_SAMPLE_BAND)
    .join(',');

  const [offer, setOffer] = useState<Offer[]>([]);
  const [credit, setCredit] = useState(false);
  const [chosen, setChosen] = useState<Set<SampleTask>>(new Set());
  const [sending, setSending] = useState<'yes' | 'no' | null>(null);
  // The answer, and which 7+ tasks were on the page when it was given. When
  // the other task of a Mock is marked later and also reaches 7, the server
  // is asked again and the card comes back for that task alone.
  const [done, setDone] = useState<{ answer: { creditPending: boolean } | 'no'; for: string } | null>(null);
  const [error, setError] = useState('');
  const answered = done?.for === candidates ? done.answer : null;

  useEffect(() => {
    // Links made before the mode was added cannot say how a sample was written.
    if (!mode || busy || !candidates || answered) return;
    let live = true;
    fetchOffer(mode, tasks)
      .then((o) => {
        if (!live) return;
        setOffer(o.offer);
        setCredit(o.credit);
        setChosen(new Set(o.offer.map((x) => x.taskType)));
      })
      // Not worth an error on the report page: the card just does not appear.
      .catch((e) => console.warn('Could not check whether this essay can be shared as a sample:', e));
    return () => { live = false; };
  }, [mode, busy, candidates, tasks, answered]);

  if (answered === 'no') return null;
  if (answered) {
    const done = answered;
    return (
      <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
        <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="m-0 font-semibold">Thank you for sharing!</p>
          <p className="m-0 mt-1 text-sm">
            Your essay will appear without your name after a quick review.
            {done.creditPending ? ' Once it is published, 1 free full report is added to your account.' : ''}
          </p>
        </div>
      </div>
    );
  }
  if (!mode || !offer.length) return null;

  const answer = async (decision: 'yes' | 'no') => {
    setSending(decision);
    setError('');
    try {
      const result = await sendConsent(mode, tasks, decision, decision === 'yes' ? [...chosen] : []);
      setDone({ answer: decision === 'yes' ? { creditPending: result.creditPending } : 'no', for: candidates });
      setOffer([]);
      if (decision === 'yes') onAnswered?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(null);
    }
  };

  const toggle = (t: SampleTask) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <section
      aria-labelledby="sample-consent-title"
      className="mt-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ink-blue)]/10 text-xl" aria-hidden>
          🎉
        </span>
        <div className="min-w-0">
          <h2 id="sample-consent-title" className="m-0 text-base font-bold text-[var(--text-primary)]">
            Band 7+! Can we show your essay anonymously as a sample answer for other students?
          </h2>
          {offer.length === 1 && (
            <p className="m-0 mt-1 text-sm font-medium text-[var(--text-primary)]">
              {label(offer[0].taskType)} — Band <span className="font-mono tabular-nums">{fmt(offer[0].band)}</span>
            </p>
          )}
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
            {credit && (
              <span className="inline-flex items-center gap-1.5">
                <Gift className="h-4 w-4 text-[var(--ink-blue)]" aria-hidden /> If we publish it, you get 1 free full report.
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden /> No name or account is shown.
            </span>
          </p>
        </div>
      </div>

      {offer.length > 1 && (
        <fieldset className="m-0 mt-4 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Essays to share</legend>
          {offer.map((o) => {
            const on = chosen.has(o.taskType);
            return (
              <label
                key={o.taskType}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] ${
                  on
                    ? 'border-[var(--ink-blue)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
                }`}
              >
                <input type="checkbox" className="h-4 w-4 accent-[var(--ink-blue)]" checked={on} onChange={() => toggle(o.taskType)} />
                {label(o.taskType)} — Band <span className="font-mono tabular-nums">{fmt(o.band)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => answer('yes')} loading={sending === 'yes'} disabled={sending !== null || chosen.size === 0}>
          Yes, share anonymously
        </Button>
        <Button variant="outline" onClick={() => answer('no')} loading={sending === 'no'} disabled={sending !== null}>
          No thanks
        </Button>
        <Link to="/terms#sample-answers" className="ml-1 text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline">
          How sharing works
        </Link>
      </div>
      {error && <p role="alert" className="m-0 mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </section>
  );
}
