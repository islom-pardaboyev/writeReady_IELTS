import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Menu, X } from 'lucide-react';

/**
 * The frame of the public sample-answer pages. It is light on purpose: the
 * build renders it to static HTML (scripts/prerender-questions.tsx), so it
 * reads nothing from the browser or Firebase, and the app renders the same
 * frame for visitors, so nothing on the page moves when it takes over. A
 * signed-in student gets the app's own layout instead (src/pages/questions/QuestionPages.tsx).
 *
 * It looks like the site header (src/components/layout/Header.tsx) and lists
 * the same links in the same order; keep the two in step.
 */

const NAV: [to: string, label: string][] = [
  ['/writing/mock', 'Writing'],
  ['/questions', 'Sample answers'],
  ['/blog', 'Blog'],
  ['/pricing', 'Pricing'],
];

const navLink =
  'rounded-full px-3.5 py-2 text-[0.9375rem] font-semibold text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] aria-[current=page]:bg-[var(--accent)] aria-[current=page]:text-[var(--accent-foreground)]';

const footerLink = 'text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline';

export function QuestionsShell({ children }: { children: ReactNode }) {
  // The phone menu. Closed in the HTML the build writes, so the static page
  // and the app's first render match.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--bg-card)] focus:px-4 focus:py-2 focus:shadow-[var(--shadow-lg)]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur-[8px]">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-2 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
            <img src="/logo.svg" width={40} height={40} className="size-8 sm:size-[40px]" alt="" />
            <span className="whitespace-nowrap font-display text-base font-extrabold text-[var(--text-primary)] sm:text-lg">
              WriteReady <span className="hidden text-[var(--ink-blue)] sm:inline">IELTS</span>
            </span>
          </Link>
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1 lg:flex">
              {NAV.map(([to, label]) => (
                <NavLink key={to} to={to} className={navLink}>{label}</NavLink>
              ))}
              <Link to="/auth?mode=login" className={navLink}>Sign in</Link>
            </div>
            <Link
              to="/auth?mode=signup"
              className="ml-1 inline-flex items-center whitespace-nowrap rounded-full bg-[var(--ink-blue-solid)] px-4 py-2.5 text-sm font-bold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 md:px-5"
            >
              Start Free
            </Link>
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="questions-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
            >
              {menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
            </button>
          </nav>
        </div>
        {menuOpen && (
          <div id="questions-menu" className="border-t border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 sm:px-6 lg:hidden">
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {[...NAV, ['/auth?mode=login', 'Sign in'] as [string, string]].map(([to, label]) => (
                <li key={to}>
                  <NavLink to={to} onClick={() => setMenuOpen(false)} className={`${navLink} block`}>{label}</NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        <nav aria-label="Legal" className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/questions" className={footerLink}>Sample answers</Link>
          <Link to="/faq" className={footerLink}>FAQ</Link>
          <Link to="/privacy" className={footerLink}>Privacy Policy</Link>
          <Link to="/terms" className={footerLink}>Terms of Service</Link>
        </nav>
        <p className="m-0">© {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners</p>
      </footer>
    </div>
  );
}
