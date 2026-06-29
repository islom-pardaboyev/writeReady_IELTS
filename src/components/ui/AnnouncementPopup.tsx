import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getActiveAnnouncement, type Announcement, type AnnouncementCategory } from '../../firebase/firestore';
import { Megaphone, Rocket, Wrench, Lightbulb, Gift, X, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './dialog';

const CATEGORY_META: Record<
  AnnouncementCategory,
  { label: string; icon: typeof Megaphone; from: string; to: string; chipText: string; ring: string }
> = {
  announcement: { label: 'E\u02bclon',     icon: Megaphone,  from: 'from-blue-600',    to: 'to-blue-500',    chipText: 'text-blue-50',    ring: 'ring-blue-400/40' },
  update:       { label: 'Yangilanish',    icon: Rocket,     from: 'from-emerald-600', to: 'to-emerald-500', chipText: 'text-emerald-50', ring: 'ring-emerald-400/40' },
  maintenance:  { label: 'Texnik xizmat',  icon: Wrench,     from: 'from-amber-600',   to: 'to-amber-500',   chipText: 'text-amber-50',   ring: 'ring-amber-400/40' },
  tip:          { label: 'Maslahat',       icon: Lightbulb,  from: 'from-purple-600',  to: 'to-purple-500',  chipText: 'text-purple-50',  ring: 'ring-purple-400/40' },
  offer:        { label: 'Taklif',         icon: Gift,       from: 'from-rose-600',    to: 'to-rose-500',    chipText: 'text-rose-50',    ring: 'ring-rose-400/40' },
};

// One key per session — cleared when user closes the tab/browser
const SESSION_DISMISSED_KEY = 'ann_session_dismissed';

export function AnnouncementPopup() {
  useAuth(); // keep auth context warm
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // If already dismissed in this session, don't show again
    if (sessionStorage.getItem(SESSION_DISMISSED_KEY)) return;
    getActiveAnnouncement().then((ann) => {
      if (!ann) return;
      setAnnouncement(ann);
      setTimeout(() => setOpen(true), 600);
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    setOpen(false);
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
  };

  if (!announcement) return null;

  const meta = CATEGORY_META[announcement.category] ?? CATEGORY_META.announcement;
  const Icon = meta.icon;
  const title = announcement.title || announcement.text;
  const hasBody = Boolean(announcement.title && announcement.text);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="bg-white dark:bg-slate-900 max-w-[440px] p-0 overflow-hidden gap-0 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <div className={`relative bg-gradient-to-br ${meta.from} ${meta.to} px-6 pt-6 pb-7 overflow-hidden`}>
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-10 w-20 h-20 rounded-full bg-black/10 blur-xl" />

          <button
            onClick={dismiss}
            aria-label="Yopish"
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer border-0 bg-transparent"
          >
            <X size={18} strokeWidth={2.25} />
          </button>

          <div className={`relative inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/15 ring-1 ${meta.ring} mb-3.5`}>
            <Icon size={22} strokeWidth={2} className="text-white" />
          </div>

          <span className={`relative block text-[0.7rem] font-semibold tracking-wide uppercase mb-1.5 ${meta.chipText}`}>
            {meta.label}
          </span>
          <DialogTitle className="relative text-white text-[1.4rem] font-bold leading-snug m-0 p-0">
            {title}
          </DialogTitle>
        </div>

        {/* Body */}
        {hasBody && (
          <div className="px-6 pt-5 pb-1">
            <p className="text-slate-600 dark:text-slate-300 text-[0.925rem] leading-relaxed m-0">
              {announcement.text}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className={`px-6 pb-6 flex items-center gap-2.5 ${hasBody ? 'pt-5' : 'pt-6'}`}>
          {announcement.link ? (
            <>
              <a
                href={announcement.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className={`group inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-semibold text-sm text-white no-underline bg-gradient-to-br ${meta.from} ${meta.to} shadow-sm hover:shadow-md hover:brightness-105 active:brightness-95 transition-all`}
              >
                {announcement.linkLabel || "Ko'proq"}
                <ArrowRight size={16} strokeWidth={2.25} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <button
                onClick={dismiss}
                className="px-4 py-2.5 rounded-xl font-medium text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent border-0 cursor-pointer transition-colors"
              >
                Yopish
              </button>
            </>
          ) : (
            <button
              onClick={dismiss}
              className={`w-full justify-center inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-br ${meta.from} ${meta.to} shadow-sm hover:shadow-md hover:brightness-105 active:brightness-95 transition-all cursor-pointer border-0`}
            >
              Tushunarli!
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}