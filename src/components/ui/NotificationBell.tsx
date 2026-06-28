import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getUnreadNotificationCount, getNotifications, markNotificationsRead } from '../../firebase/blog';
import type { Notification } from '../../types/blog';

function relativeTime(d: Date | null): string {
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nLoading, setNLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    getUnreadNotificationCount(user.uid).then(setUnreadCount);
    const interval = setInterval(() => {
      getUnreadNotificationCount(user.uid).then(setUnreadCount);
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = async () => {
    if (!user) return;
    const next = !open;
    setOpen(next);
    if (next) {
      setNLoading(true);
      const notifs = await getNotifications(user.uid);
      setNotifications(notifs);
      setNLoading(false);
      if (unreadCount > 0) {
        await markNotificationsRead(user.uid);
        setUnreadCount(0);
      }
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-80 overflow-y-auto bg-white dark:bg-slate-900 border border-[var(--border-color)] rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
          </div>

          {nLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] text-center py-8">No notifications yet</p>
          ) : (
            <div>
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  to={`/blog/${n.postSlug}`}
                  onClick={() => setOpen(false)}
                  className="no-underline flex gap-3 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors border-b border-[var(--border-color)] last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 shrink-0">
                    {n.fromUserName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] leading-5">
                      <span className="font-semibold">{n.fromUserName}</span>{' '}
                      {n.type === 'like' ? 'liked your comment' : 'commented'}
                    </p>
                    {n.preview && (
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{n.preview.slice(0, 60)}</p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{relativeTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
