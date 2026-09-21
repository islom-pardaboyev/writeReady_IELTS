import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Header } from './Header';
import { IELTS_DISCLAIMER } from '../../lib/legal';
import { SkipLink } from './SkipLink';
import { ChatBot } from '../ui/ChatBot';

interface LayoutProps {
  children: ReactNode;
  noHeader?: boolean;
}

export function Layout({ children, noHeader }: LayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <SkipLink />
      {!noHeader && <Header />}
      <main id="main-content" tabIndex={-1} className="outline-none flex-1 bg-[var(--bg-base)]">{children}</main>
      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        <nav aria-label="Legal" className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/privacy" className="rounded text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            Privacy Policy
          </Link>
          <Link to="/terms" className="rounded text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            Terms of Service
          </Link>
        </nav>
        <p className="m-0">© {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners</p>
        <p className="mx-auto mt-2 max-w-[640px] text-[0.75rem] leading-relaxed opacity-90">{IELTS_DISCLAIMER}</p>
      </footer>
      <ChatBot />
    </div>
  );
}
