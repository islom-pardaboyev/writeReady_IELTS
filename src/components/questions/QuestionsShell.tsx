import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * The frame of the public sample-answer pages. It is light on purpose: the
 * build renders it to static HTML (scripts/prerender-questions.tsx), so it
 * reads nothing from the browser or Firebase, and the app renders the same
 * frame after it loads, so nothing on the page moves when it takes over.
 * `actions` is the right-hand side of the bar: Sign in / Start free in the
 * static HTML, the student's own links once the app knows who is signed in.
 */

const navLink =
  'rounded-[6px] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] no-underline transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';

export function SignedOutActions() {
  return (
    <>
      <Link to="/auth" className={`${navLink} hidden sm:inline-flex`}>Sign in</Link>
      <Link
        to="/auth?mode=signup"
        className="inline-flex h-9 items-center rounded-lg bg-[var(--ink-blue)] px-3.5 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 dark:text-[var(--primary-foreground)]"
      >
        Start free
      </Link>
    </>
  );
}

export function QuestionsShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--bg-card)] focus:px-4 focus:py-2 focus:shadow-[var(--shadow-lg)]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur-[8px]">
        <div className="mx-auto flex h-[60px] max-w-[1160px] items-center justify-between gap-2 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
            <img src="/logo.svg" width={40} height={40} className="size-8 sm:size-[40px]" alt="" />
            <span className="whitespace-nowrap text-base font-bold text-[var(--text-primary)] sm:text-lg">
              WriteReady <span className="hidden text-[var(--ink-blue)] sm:inline">IELTS</span>
            </span>
          </Link>
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1">
            <Link to="/questions" className={`${navLink} hidden md:inline-flex`}>Sample answers</Link>
            <Link to="/blog" className={`${navLink} hidden md:inline-flex`}>Blog</Link>
            <Link to="/pricing" className={`${navLink} hidden md:inline-flex`}>Pricing</Link>
            {actions ?? <SignedOutActions />}
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        <nav aria-label="Legal" className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/questions" className="text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline">Sample answers</Link>
          <Link to="/faq" className="text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline">FAQ</Link>
          <Link to="/privacy" className="text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline">Privacy Policy</Link>
          <Link to="/terms" className="text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline">Terms of Service</Link>
        </nav>
        <p className="m-0">© {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners</p>
      </footer>
    </div>
  );
}
