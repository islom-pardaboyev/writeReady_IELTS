import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getActiveAnnouncement, type Announcement } from '../../firebase/firestore';

export function AnnouncementBanner() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    getActiveAnnouncement().then(setAnnouncement).catch(() => {});
  }, [user]);

  if (!user || !announcement || dismissed) return null;

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-white text-sm">
      <span className="text-base shrink-0">📢</span>
      <p className="flex-1 leading-snug">{announcement.text}</p>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/70 hover:text-white bg-transparent border-none cursor-pointer text-lg leading-none shrink-0"
        aria-label="Yopish"
      >×</button>
    </div>
  );
}
