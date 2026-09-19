import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatDuration, splitDuration } from '@/lib/duration';
import Logo from '/logo.svg';

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
    <div className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="mx-auto flex w-full max-w-[1160px] items-center gap-2 px-6 py-5">
        <img src={Logo} width={36} height={36} className="size-9" alt="" />
        <span className="text-lg font-bold">
          WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center justify-center px-6 pb-20 pt-8 text-center">
        <h1 className="text-balance text-[clamp(2.25rem,5.5vw,3.75rem)] font-black leading-[1.05] tracking-[-0.035em]">
          {counting ? (
            <>
              We reopen {day === 'today' || day === 'tomorrow' ? '' : 'on '}
              <span className="whitespace-nowrap text-[var(--ink-blue)]">{day}.</span>
            </>
          ) : pastEnd ? (
            <>
              Almost <span className="text-[var(--ink-blue)]">done.</span>
            </>
          ) : (
            <>
              We'll be back <span className="text-[var(--ink-blue)]">soon.</span>
            </>
          )}
        </h1>

        <p className="mt-5 max-w-[50ch] text-pretty text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
          {pastEnd
            ? "We're finishing the last checks and will reopen very soon. Thank you for waiting."
            : counting
              ? 'WriteReady is closed for maintenance. Your account, essays and feedback reports are safe and will be here when we reopen.'
              : "WriteReady is closed for maintenance and we don't have a reopening time yet. Your account, essays and feedback reports are safe and will be here when we reopen."}
        </p>

        {counting && <Countdown now={now} startedAt={startedAt} endsAt={endsAt} />}

        {endsAt === null && startedAt !== null && (
          <p className="mt-8 text-sm text-[var(--text-secondary)]">
            Closed for <span className="font-mono tabular-nums text-[var(--text-primary)]">{formatDuration(now - startedAt)}</span> so far
          </p>
        )}

        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] px-5 text-[0.9375rem] font-semibold text-[var(--text-primary)] no-underline transition-colors hover:border-[var(--ink-blue)] hover:text-[var(--ink-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
          Message us on Telegram
        </a>
      </main>

      <footer className="mx-auto w-full max-w-[1160px] border-t border-[var(--border-color)] px-6 py-5 text-center text-sm text-[var(--text-secondary)]">
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
    <section aria-label="Time until WriteReady reopens" className="mt-10 w-full">
      <p className="sr-only">
        {days} {parts[0].label}, {hours} {parts[1].label} and {minutes} {parts[2].label} left.
      </p>
      <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div aria-hidden="true" className="grid grid-cols-4 divide-x divide-[var(--border-color)]">
          {parts.map((p) => (
            <div key={p.label} className="px-1 py-5 sm:py-7">
              <span className="block font-mono text-[clamp(1.875rem,7vw,3.25rem)] font-semibold leading-none tabular-nums tracking-tight">
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
            className="h-1 bg-[var(--bg-subtle)]"
          >
            <div className="h-full bg-[var(--ink-blue)]" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <p className="mt-4 text-sm text-[var(--text-secondary)]">
        Reopens <span className="font-medium text-[var(--text-primary)]">{reopenMoment(endsAt)}</span>, your time
      </p>
    </section>
  );
}
