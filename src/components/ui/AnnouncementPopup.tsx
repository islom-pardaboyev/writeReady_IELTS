import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getActiveAnnouncement, type Announcement, type AnnouncementCategory } from '../../firebase/firestore';

const CATEGORY_META: Record<AnnouncementCategory, { label: string; gradient: string; icon: string; accent: string }> = {
  announcement: { label: 'Announcement', gradient: 'from-blue-600 to-indigo-600',   icon: '📢', accent: 'text-blue-600' },
  update:        { label: 'Update',       gradient: 'from-emerald-500 to-teal-600',  icon: '🚀', accent: 'text-emerald-600' },
  maintenance:   { label: 'Maintenance',  gradient: 'from-amber-500 to-orange-500',  icon: '🔧', accent: 'text-amber-600' },
  tip:           { label: 'Tip',          gradient: 'from-purple-600 to-violet-600', icon: '💡', accent: 'text-purple-600' },
  offer:         { label: 'Offer',        gradient: 'from-rose-500 to-pink-600',     icon: '🎁', accent: 'text-rose-600' },
};

const DISMISS_KEY = 'ann_dismissed';

export function AnnouncementPopup() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    getActiveAnnouncement().then((ann) => {
      if (!ann) return;
      const key = `${DISMISS_KEY}_${ann.id}`;
      if (sessionStorage.getItem(key)) return;
      setAnnouncement(ann);
      setTimeout(() => setVisible(true), 700);
    }).catch(() => {});
  }, [user]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => {
      setDismissed(true);
      if (announcement) sessionStorage.setItem(`${DISMISS_KEY}_${announcement.id}`, '1');
    }, 350);
  };

  if (!user || !announcement || dismissed) return null;

  const meta = CATEGORY_META[announcement.category] ?? CATEGORY_META.announcement;
  const title = announcement.title || announcement.text.slice(0, 60);
  const hasBody = announcement.title && announcement.text;

  return (
    <>
      {/* Backdrop blur (subtle) */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-350 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: visible ? 'blur(2px)' : 'none' }}
      />

      {/* Dialog card — centered */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none`}>
        <div
          className={`w-full max-w-[440px] pointer-events-auto transition-all duration-350 ${
            visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
          }`}
        >
          <div className="rounded-2xl overflow-hidden shadow-2xl bg-[var(--bg-card)]">

            {/* Gradient header */}
            <div className={`bg-gradient-to-r ${meta.gradient} px-6 py-5 relative`}>
              {/* Category chip */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-white/80 text-xs font-bold tracking-widest uppercase">
                  {meta.icon} {meta.label}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-white font-fraunces text-2xl font-bold leading-tight pr-8">
                {title}
              </h2>

              {/* Close */}
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-lg cursor-pointer border-0 transition-colors leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Body */}
            {hasBody && (
              <div className="px-6 py-5">
                <p className="text-[var(--text-secondary)] leading-relaxed text-sm">
                  {announcement.text}
                </p>

                {announcement.link && (
                  <div className="mt-5 flex items-center gap-3">
                    <a
                      href={announcement.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white no-underline bg-gradient-to-r ${meta.gradient} hover:opacity-90 transition-opacity shadow-sm`}
                    >
                      {announcement.linkLabel || 'Learn more'} →
                    </a>
                    <button
                      onClick={dismiss}
                      className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent border-0 cursor-pointer transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {!announcement.link && (
                  <div className="mt-5">
                    <button
                      onClick={dismiss}
                      className={`px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r ${meta.gradient} hover:opacity-90 transition-opacity cursor-pointer border-0`}
                    >
                      Got it!
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* If no separate body text, just show close button */}
            {!hasBody && (
              <div className="px-6 py-4 flex justify-end">
                <button
                  onClick={dismiss}
                  className={`px-5 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r ${meta.gradient} hover:opacity-90 transition-opacity cursor-pointer border-0`}
                >
                  Got it!
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
