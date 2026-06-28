import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { Header } from './Header';
import { ChatBot } from '../ui/ChatBot';
import { getActiveAnnouncement, type Announcement } from '../../firebase/firestore';

interface LayoutProps {
  children: ReactNode;
  noHeader?: boolean;
}

export function Layout({ children, noHeader }: LayoutProps) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getActiveAnnouncement().then(setAnnouncement).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {!noHeader && <Header />}
      {announcement && !dismissed && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-white text-sm">
          <span className="text-base shrink-0">📢</span>
          <p className="flex-1 leading-snug">{announcement.text}</p>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/70 hover:text-white bg-transparent border-none cursor-pointer text-lg leading-none shrink-0"
            aria-label="Yopish"
          >×</button>
        </div>
      )}
      <main className="flex-1 bg-[var(--bg-base)]">{children}</main>
      <footer className="border-t border-[var(--border-color)] text-[0.8125rem] text-center p-5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
        © {new Date().getFullYear()} WriteReady IELTS · Built for IELTS learners
      </footer>
      <ChatBot />
    </div>
  );
}
