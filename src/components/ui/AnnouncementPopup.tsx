import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getActiveAnnouncement, type Announcement, type AnnouncementCategory } from '../../firebase/firestore';

const CATEGORY_META: Record<AnnouncementCategory, { label: string; color: string; bg: string; border: string; icon: string }> = {
  announcement: { label: 'Announcement', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-600', border: 'border-blue-200 dark:border-blue-800', icon: '📢' },
  update:        { label: 'Update',       color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-600', border: 'border-emerald-200 dark:border-emerald-800', icon: '🚀' },
  maintenance:   { label: 'Maintenance',  color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800', icon: '🔧' },
  tip:           { label: 'Tip',          color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-600', border: 'border-purple-200 dark:border-purple-800', icon: '💡' },
  offer:         { label: 'Offer',        color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-600', border: 'border-rose-200 dark:border-rose-800', icon: '🎁' },
};

const DISMISS_KEY = 'ann_dismissed';

export function AnnouncementPopup() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!user) return;
    getActiveAnnouncement().then((ann) => {
      if (!ann) return;
      const key = `${DISMISS_KEY}_${ann.id}`;
      if (sessionStorage.getItem(key)) return;
      setAnnouncement(ann);
      // slight delay so popup slides in after page load
      setTimeout(() => { setVisible(true); setMounted(true); }, 800);
    }).catch(() => {});
  }, [user]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => {
      setDismissed(true);
      if (announcement) sessionStorage.setItem(`${DISMISS_KEY}_${announcement.id}`, '1');
    }, 300);
  };

  if (!user || !announcement || dismissed) return null;

  const meta = CATEGORY_META[announcement.category] ?? CATEGORY_META.announcement;

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 w-[340px] max-w-[calc(100vw-2.5rem)] transition-all duration-300 ${
        mounted && visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      role="dialog"
      aria-label="Announcement"
    >
      <div className={`bg-[var(--bg-card)] border ${meta.border} rounded-2xl shadow-2xl overflow-hidden`}>
        {/* Category strip */}
        <div className={`${meta.bg} px-4 py-2 flex items-center justify-between`}>
          <span className="text-white text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
            <span>{meta.icon}</span>
            {meta.label}
          </span>
          <button
            onClick={dismiss}
            className="text-white/70 hover:text-white bg-transparent border-none cursor-pointer text-lg leading-none"
            aria-label="Close"
          >×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {announcement.title && (
            <h3 className="font-fraunces text-xl font-bold text-[var(--text-primary)] mb-2 leading-tight">
              {announcement.title}
            </h3>
          )}
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {announcement.text}
          </p>

          {announcement.link && (
            <a
              href={announcement.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold no-underline px-4 py-2 rounded-lg ${meta.bg} text-white hover:opacity-90 transition-opacity`}
            >
              {announcement.linkLabel || 'Learn more'} →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
