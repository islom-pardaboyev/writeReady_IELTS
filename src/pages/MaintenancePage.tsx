import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { formatDuration, splitDuration } from '@/lib/duration';
import Logo from '/logo.svg';
import { PenUnderline } from '@/components/landing/PenUnderline';

const TELEGRAM_URL = 'https://t.me/writeready_admin';

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "today", "tomorrow" or "18 November", in the visitor's own time zone.
function reopenDay(endsAt: number, now: number) {
  const end = new Date(endsAt);
  const today = new Date(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (sameDay(end, today)) return 'today';
  if (sameDay(end, tomorrow)) return 'tomorrow';
  return end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(end.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  });
}

// "Wednesday 18 November 2026 at 20:13"
function reopenMoment(endsAt: number) {
  const end = new Date(endsAt);
  const day = end.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} at ${time}`;
}

export function MaintenancePage({ startedAt, endsAt }: { startedAt: number | null; endsAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = 'Closed for maintenance | WriteReady IELTS';
  }, []);

  const counting = endsAt !== null && endsAt > now;
  const pastEnd = endsAt !== null && endsAt <= now;
  const day = counting ? reopenDay(endsAt, now) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-card)] text-[var(--text-primary)] dark:bg-[var(--bg-base)]">
      <header className="mx-auto flex w-full max-w-[1280px] shrink-0 items-center gap-2 px-5 py-[clamp(0.5rem,2dvh,1rem)] sm:px-6">
        <img src={Logo} width={40} height={40} className="size-9 sm:size-10" alt="" />
        <span className="font-display text-lg font-extrabold">
          WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
        </span>
      </header>

      {/* Every vertical gap shrinks with the screen's height, so the page shows whole on a laptop or a phone. */}
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center px-5 pb-[clamp(0.5rem,2.5dvh,3.5rem)] pt-1 text-center sm:px-6">
        {/* The home page's headline: dark words, and the examiner's red line under the ones that matter. */}
        <h1 className="text-balance font-display text-[clamp(2rem,min(6vw,9dvh),4.25rem)] font-extrabold leading-[1.05] tracking-[-0.035em]">
          {counting ? (
            <>
              We reopen {day === 'today' || day === 'tomorrow' ? '' : 'on '}
              {/* Held on one line from sm up, where there is room for it. A
                  narrow phone plus a long date ("27 September 2027") runs past
                  the screen edge, and a wrapped date beats a clipped one. */}
              <span className="relative inline-block sm:whitespace-nowrap">{day}.<PenUnderline /></span>
            </>
          ) : pastEnd ? (
            <>
              Almost <span className="relative inline-block whitespace-nowrap">done.<PenUnderline /></span>
            </>
          ) : (
            <>
              We'll be back <span className="relative inline-block whitespace-nowrap">soon.<PenUnderline /></span>
            </>
          )}
        </h1>

        <p className="mt-[clamp(0.75rem,2.4dvh,1.75rem)] max-w-[50ch] text-pretty text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
          {pastEnd
            ? "We're finishing the last checks and will reopen very soon. Thank you for waiting."
            : counting
              ? 'WriteReady is closed for maintenance. Your account, essays and feedback reports are safe and will be here when we reopen.'
              : "WriteReady is closed for maintenance and we don't have a reopening time yet. Your account, essays and feedback reports are safe and will be here when we reopen."}
        </p>

        {counting && <Countdown now={now} startedAt={startedAt} endsAt={endsAt} />}

        {endsAt === null && startedAt !== null && (
          <p className="mt-[clamp(0.75rem,2.6dvh,2rem)] text-sm text-[var(--text-secondary)]">
            Closed for <span className="font-mono tabular-nums text-[var(--text-primary)]">{formatDuration(now - startedAt)}</span> so far
          </p>
        )}

        {/* The sample-answer pages are static and stay open through maintenance
            (src/components/layout/MaintenanceGate.tsx), so there is still
            something to study. */}
        <div className="mt-[clamp(0.75rem,2.6dvh,2rem)] flex w-full flex-col items-center gap-2.5 rounded-3xl bg-field-lilac px-5 py-3 text-field-ink sm:py-3.5 sm:flex-row sm:justify-between sm:gap-5 sm:text-left">
          <p className="m-0 text-[0.9375rem] leading-snug">
            <span className="block font-display text-base font-extrabold">Sample answers are still open</span>
            <span className="text-field-ink/80">Read Band 7+ answers, with vocabulary in Uzbek, while you wait.</span>
          </p>
          <Link
            to="/questions"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-field-ink px-5 text-sm font-bold text-field-lilac no-underline transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-ink focus-visible:ring-offset-2 focus-visible:ring-offset-field-lilac motion-reduce:hover:translate-y-0"
          >
            Read sample answers
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-[clamp(0.5rem,1.6dvh,1.25rem)] inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-[var(--border-strong)] bg-[var(--bg-card)] px-6 text-[0.9375rem] font-bold text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
          Message us on Telegram
        </a>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] shrink-0 border-t border-[var(--border-color)] px-5 py-[clamp(0.625rem,2.2dvh,1.25rem)] text-center text-sm text-[var(--text-secondary)] sm:px-6">
        Teachers and learning centers can still sign in to the{' '}
        <Link to="/teacher-portal" className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-blue)] hover:decoration-current">
          teacher portal
        </Link>{' '}
        and the{' '}
        <Link to="/center-admin" className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-blue)] hover:decoration-current">
          learning center portal
        </Link>
        .
      </footer>
    </div>
  );
}

function Countdown({ now, startedAt, endsAt }: { now: number; startedAt: number | null; endsAt: number }) {
  const { days, hours, minutes, seconds } = splitDuration(endsAt - now);
  const parts = [
    { label: days === 1 ? 'day' : 'days', value: days },
    { label: hours === 1 ? 'hour' : 'hours', value: hours },
    { label: minutes === 1 ? 'minute' : 'minutes', value: minutes },
    { label: seconds === 1 ? 'second' : 'seconds', value: seconds },
  ];
  // Share of the planned closure already behind us; only shown when we know when it began.
  const progress =
    startedAt !== null && endsAt > startedAt
      ? Math.min(100, Math.max(0, Math.round(((now - startedAt) / (endsAt - startedAt)) * 100)))
      : null;

  return (
    <section aria-label="Time until WriteReady reopens" className="mt-[clamp(0.75rem,2.6dvh,2rem)] w-full">
      <p className="sr-only">
        {days} {parts[0].label}, {hours} {parts[1].label} and {minutes} {parts[2].label} left.
      </p>
      {/* The indigo field, holding one white sheet for each unit */}
      <div className="rounded-3xl bg-brand-600 p-3 sm:p-4">
        <div aria-hidden="true" className="grid grid-cols-4 gap-2 sm:gap-3">
          {parts.map((p) => (
            <div key={p.label} className="rounded-2xl bg-[var(--bg-card)] px-1 py-[clamp(0.625rem,2dvh,1.5rem)]">
              <span className="block font-mono text-[clamp(1.75rem,min(7vw,7dvh),3.25rem)] font-semibold leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
                {String(p.value).padStart(2, '0')}
              </span>
              <span className="mt-2.5 block text-xs text-[var(--text-secondary)] sm:text-sm">{p.label}</span>
            </div>
          ))}
        </div>
        {progress !== null && (
          <div
            role="progressbar"
            aria-label="Planned maintenance time passed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mx-1 mt-3 h-2 overflow-hidden rounded-full bg-white/25 sm:mt-4"
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Reopens <span className="font-medium text-[var(--text-primary)]">{reopenMoment(endsAt)}</span>, your time
      </p>
    </section>
  );
}
