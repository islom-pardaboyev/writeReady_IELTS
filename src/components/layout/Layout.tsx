import type { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  noHeader?: boolean;
}

export function Layout({ children, noHeader }: LayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {!noHeader && <Header />}
      <main className="flex-1 bg-[var(--bg-base)]">{children}</main>
      <footer className="border-t border-[var(--border-color)] text-[0.8125rem] text-center p-5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
        © {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners
      </footer>
    </div>
  );
}
