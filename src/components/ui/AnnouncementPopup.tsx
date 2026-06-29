import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getActiveAnnouncement, type Announcement, type AnnouncementCategory } from '../../firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './dialog';

const CATEGORY_META: Record<AnnouncementCategory, { label: string; color: string; bg: string; icon: string }> = {
  announcement: { label: 'Announcement', color: 'text-blue-700',   bg: 'bg-blue-600',   icon: '📢' },
  update:        { label: 'Update',       color: 'text-emerald-700', bg: 'bg-emerald-600', icon: '🚀' },
  maintenance:   { label: 'Maintenance',  color: 'text-amber-700',  bg: 'bg-amber-500',   icon: '🔧' },
  tip:           { label: 'Tip',          color: 'text-purple-700', bg: 'bg-purple-600',  icon: '💡' },
  offer:         { label: 'Offer',        color: 'text-rose-700',   bg: 'bg-rose-500',    icon: '🎁' },
};

const DISMISS_KEY = 'ann_dismissed';

export function AnnouncementPopup() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    getActiveAnnouncement().then((ann) => {
      if (!ann) return;
      const key = `${DISMISS_KEY}_${ann.id}`;
      if (sessionStorage.getItem(key)) return;
      setAnnouncement(ann);
      setTimeout(() => setOpen(true), 600);
    }).catch(() => {});
  }, [user]);

  const dismiss = () => {
    setOpen(false);
    if (announcement) sessionStorage.setItem(`${DISMISS_KEY}_${announcement.id}`, '1');
  };

  if (!user || !announcement) return null;

  const meta = CATEGORY_META[announcement.category] ?? CATEGORY_META.announcement;
  const title = announcement.title || announcement.text;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="bg-white dark:bg-slate-900 max-w-[460px] p-0 overflow-hidden gap-0">
        {/* Colored header strip */}
        <div className={`${meta.bg} px-6 py-5`}>
          <span className="text-white/80 text-[0.65rem] font-bold tracking-widest uppercase block mb-2">
            {meta.icon} {meta.label}
          </span>
          <DialogTitle className="text-white text-2xl font-bold leading-tight m-0 p-0">
            {title}
          </DialogTitle>
        </div>

        {/* Body */}
        {announcement.title && announcement.text && (
          <div className="px-6 py-5">
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              {announcement.text}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className={`px-6 pb-5 flex items-center gap-3 ${announcement.title && announcement.text ? 'pt-0' : 'pt-5'}`}>
          {announcement.link ? (
            <>
              <a
                href={announcement.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className={`px-5 py-2.5 rounded-lg font-semibold text-sm text-white no-underline ${meta.bg} hover:opacity-90 transition-opacity`}
              >
                {announcement.linkLabel || 'Ko\'proq'}  →
              </a>
              <button
                onClick={dismiss}
                className="text-sm text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
              >
                Yopish
              </button>
            </>
          ) : (
            <button
              onClick={dismiss}
              className={`px-5 py-2.5 rounded-lg font-semibold text-sm text-white ${meta.bg} hover:opacity-90 transition-opacity cursor-pointer border-0`}
            >
              Tushunarli!
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
