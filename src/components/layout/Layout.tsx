import type { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  noHeader?: boolean;
}

export function Layout({ children, noHeader }: LayoutProps) {
  return (
    <div >
      {!noHeader && <Header />}
      <main>{children}</main>
      <footer
        style={{
          background: 'var(--ink-blue)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.8125rem',
          textAlign: 'center',
          padding: '1.25rem',
          marginTop: 'auto',
        }}
      >
        © {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners
      </footer>
    </div>
  );
}
