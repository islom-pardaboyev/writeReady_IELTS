import type { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  noHeader?: boolean;
}

export function Layout({ children, noHeader }: LayoutProps) {
  return (
    <div className="flex flex-col text-slate-400 min-h-screen">
      {!noHeader && <Header />}
      <main className="flex-1 bg-slate-50">{children}</main>
      <footer
        className="border-t border-slate-200 text-[0.8125rem] text-center p-5"
      >
        © {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners
      </footer>
    </div>
  );
}