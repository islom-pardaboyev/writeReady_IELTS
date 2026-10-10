import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Newspaper, PenLine, Timer, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PenUnderline } from '@/components/landing/PenUnderline';
import Logo from '/logo.svg';

// The same icon and colour each mode wears on the home page.
const QUICK_LINKS = [
  { to: '/writing/mock', label: 'Mock Exam', hint: '60-minute full test', Icon: Timer, well: 'bg-brand-600 text-white' },
  { to: '/writing/practice', label: 'Practice Mode', hint: 'No timer pressure', Icon: PenLine, well: 'bg-field-mint text-field-ink' },
  { to: '/writing/quick', label: 'Quick Write', hint: 'One short task', Icon: Zap, well: 'bg-field-amber text-field-ink' },
  { to: '/blog', label: 'IELTS Blog', hint: 'Tips and sample answers', Icon: Newspaper, well: 'bg-field-lilac text-field-ink' },
];

const PILL =
  'inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[0.9375rem] font-bold no-underline transition-[background-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]';

export function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const home = user ? '/dashboard' : '/';

  useEffect(() => {
    document.title = 'Page not found | WriteReady IELTS';
  }, []);

  const handleBack = () => {
    // A bookmark or a mistyped link has no history to return to.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(home);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-card)] text-[var(--text-primary)] dark:bg-[var(--bg-base)]">
      <header className="mx-auto flex w-full max-w-[1280px] shrink-0 items-center px-5 py-[clamp(0.5rem,2dvh,1rem)] sm:px-6">
        <Link to="/" className="flex items-center gap-2 rounded-lg text-[var(--text-primary)] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2">
          <img src={Logo} width={40} height={40} className="size-9 sm:size-10" alt="" />
          <span className="font-display text-lg font-extrabold">
            WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
          </span>
        </Link>
      </header>

      {/* Every vertical gap shrinks with the screen's height, so the page shows whole on a laptop or a phone. */}
      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center px-5 pb-[clamp(0.75rem,4dvh,3.5rem)] pt-1 text-center sm:px-6">
        {/* The wrong address, marked the way a report marks a sentence */}
        <div className="w-full max-w-[460px] rounded-3xl bg-field-amber p-3 sm:p-4">
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 text-left shadow-[0_16px_34px_-14px_rgb(20_19_43/0.4)] dark:shadow-[0_16px_34px_-14px_rgb(0_0_0/0.8)]">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              <span className="font-mono tabular-nums">404</span> · Address not found
            </p>
            <p className="mt-2 truncate font-mono text-sm text-red-600 line-through decoration-1 dark:text-red-400" title={pathname}>
              writeready.uz{pathname}
            </p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              writeready.uz{home === '/' ? '' : home}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">The link may be old, or the address may have a typo.</p>
          </div>
        </div>

        <h1 className="mt-[clamp(1rem,3.4dvh,2rem)] text-balance font-display text-[clamp(2rem,min(5.5vw,8.5dvh),3.75rem)] font-extrabold leading-[1.05] tracking-[-0.035em]">
          This page doesn't{' '}
          <span className="relative inline-block whitespace-nowrap">
            exist.
            <PenUnderline />
          </span>
        </h1>

        <p className="mt-[clamp(0.875rem,2.8dvh,1.5rem)] max-w-[60ch] text-pretty text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
          Nothing is lost. Your account, essays and feedback reports are all still there.
        </p>

        <div className="mt-[clamp(0.875rem,3dvh,1.75rem)] flex flex-wrap items-center justify-center gap-3">
          <Link to={home} className={`${PILL} bg-[var(--ink-blue-solid)] text-white hover:opacity-90`}>
            {user ? 'Go to dashboard' : 'Go to home page'}
          </Link>
          <button
            type="button"
            onClick={handleBack}
            className={`${PILL} border-[1.5px] border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]`}
          >
            Go back
          </button>
        </div>

        <nav aria-labelledby="start-here" className="mt-[clamp(1rem,4dvh,2.5rem)] w-full">
          <h2 id="start-here" className="text-sm font-semibold text-[var(--text-secondary)]">Or start here</h2>
          <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-2.5 p-0 text-left sm:grid-cols-4">
            {QUICK_LINKS.map(({ to, label, hint, Icon, well }) => (
              <li key={to}>
                <Link
                  to={to}
                  title={hint}
                  className="flex h-full items-center gap-2.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${well}`}>
                    <Icon className="size-[1.125rem]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 text-sm font-bold leading-tight text-[var(--text-primary)]">
                    {label}
                    <span className="sr-only">: {hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] shrink-0 border-t border-[var(--border-color)] px-5 py-[clamp(0.625rem,2.2dvh,1.25rem)] text-center text-sm text-[var(--text-secondary)] sm:px-6">
        Still stuck?{' '}
        <a
          href="https://t.me/writeready_admin"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-blue)] hover:decoration-current"
        >
          Message us on Telegram
        </a>
        .
      </footer>
    </div>
  );
}
