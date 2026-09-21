import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import Logo from '/logo.svg';

const QUICK_LINKS = [
  { to: '/writing/mock', label: 'Mock Exam', hint: '60-minute full test' },
  { to: '/writing/practice', label: 'Practice Mode', hint: 'No timer pressure' },
  { to: '/writing/quick', label: 'Quick Write', hint: 'One short task' },
  { to: '/blog', label: 'IELTS Blog', hint: 'Tips and sample answers' },
];

export function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    document.title = 'Page not found | WriteReady IELTS';
  }, []);

  const handleBack = () => {
    // A bookmark or a mistyped link has no history to return to.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(user ? '/dashboard' : '/');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="mx-auto flex w-full max-w-[1160px] items-center px-6 py-5">
        <Link to="/" className="flex items-center gap-2 no-underline text-[var(--text-primary)]">
          <img src={Logo} width={36} height={36} className="size-9" alt="" />
          <span className="text-lg font-bold">
            WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
          </span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center justify-center px-6 pb-20 pt-8 text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-[var(--text-secondary)]">404</p>

        <h1 className="mt-4 text-balance text-[clamp(2.25rem,5.5vw,3.75rem)] font-black leading-[1.05] tracking-[-0.035em]">
          This page doesn't <span className="text-[var(--ink-blue)]">exist.</span>
        </h1>

        <p className="mt-5 max-w-[50ch] text-pretty text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
          The link may be old, or the address may have a typo. Nothing is lost — your
          account, essays and feedback reports are all still there.
        </p>

        <p className="mt-4 max-w-full truncate font-mono text-sm text-[var(--text-secondary)]">
          {pathname}
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] px-5 text-[0.9375rem] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--ink-blue)] hover:text-[var(--ink-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
          >
            Go back
          </button>
          <Link
            to={user ? '/dashboard' : '/'}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ink-blue)] px-5 text-[0.9375rem] font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
          >
            {user ? 'Go to dashboard' : 'Go to home page'}
          </Link>
        </div>

        <nav aria-label="Popular pages" className="mt-12 w-full">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Or start here
          </h2>
          <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0 text-left sm:grid-cols-2">
            {QUICK_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="flex h-full flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 no-underline transition-colors hover:border-[var(--ink-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">{link.label}</span>
                  <span className="mt-0.5 text-sm text-[var(--text-secondary)]">{link.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="mx-auto w-full max-w-[1160px] border-t border-[var(--border-color)] px-6 py-5 text-center text-sm text-[var(--text-secondary)]">
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
