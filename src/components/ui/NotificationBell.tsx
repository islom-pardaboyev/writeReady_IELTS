import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Popover } from 'radix-ui';
import { Bell, Gift, GraduationCap, Heart, MessageCircle, Newspaper } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getUnreadNotificationCount, getNotifications, markNotificationsRead } from '../../firebase/blog';
import type { Notification } from '../../types/blog';
import { cn } from '@/lib/utils';

function relativeTime(d: Date | null): string {
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Previews written for the site start with an emoji ("🎁 Tabriklaymiz!");
// the row already has an icon, so drop it.
const stripLeadingEmoji = (text: string) => text.replace(/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\s]+/u, '');

interface Described {
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  title: ReactNode;
  body?: string;
  href?: string;
}

function describe(n: Notification): Described {
  const name = n.fromUserName || 'Someone';
  const preview = stripLeadingEmoji(n.preview ?? '');
  const postHref = n.postSlug ? `/blog/${n.postSlug}` : '/blog';
  switch (n.type) {
    case 'like':
      return { icon: Heart, title: <><strong className="font-semibold">{name}</strong> liked your comment</>, body: preview, href: postHref };
    case 'comment':
      return { icon: MessageCircle, title: <><strong className="font-semibold">{name}</strong> left a comment</>, body: preview, href: postHref };
    case 'new_post':
      return { icon: Newspaper, title: <strong className="font-semibold">New blog post</strong>, body: preview, href: postHref };
    case 'human_feedback':
      return {
        icon: GraduationCap,
        title: <><strong className="font-semibold">{name}</strong> reviewed your essay</>,
        body: 'Your feedback is ready to download.',
        href: n.reviewId ? `/human-review/${n.reviewId}` : '/dashboard',
      };
    case 'bonus':
      return { icon: Gift, title: <strong className="font-semibold">Free AI analyses added</strong>, body: preview };
    default:
      return { icon: Bell, title: <strong className="font-semibold">{name}</strong>, body: preview };
  }
}

function NotificationRow({ n }: { n: Notification }) {
  const { icon: Icon, title, body, href } = describe(n);
  const unread = !n.read;
  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
        )}
      >
        <Icon size={15} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm leading-5 text-[var(--text-primary)]">{title}</span>
        {body && (
          <span className="mt-0.5 line-clamp-2 break-words text-xs leading-[18px] text-[var(--text-secondary)]">{body}</span>
        )}
        <span className="mt-1 block text-xs text-[var(--text-secondary)]" title={n.createdAt?.toLocaleString('en-GB')}>
          {relativeTime(n.createdAt)}
        </span>
      </span>
      {unread && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--ink-blue)]">
          <span className="sr-only">New</span>
        </span>
      )}
    </>
  );
  const rowClass = cn('flex gap-3 px-4 py-3', unread && 'bg-[var(--accent)]/40');

  if (!href) return <div className={rowClass}>{content}</div>;
  return (
    <Popover.Close asChild>
      <Link
        to={href}
        className={cn(
          rowClass,
          'no-underline transition-colors hover:bg-[var(--bg-subtle)] focus-visible:bg-[var(--bg-subtle)] focus-visible:outline-none',
        )}
      >
        {content}
      </Link>
    </Popover.Close>
  );
}

interface NotificationBellProps {
  /** Which side of the bell the panel opens on; it flips if there's no room. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export function NotificationBell({ side = 'bottom', align = 'end' }: NotificationBellProps) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [sideOffset, setSideOffset] = useState(10);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Counted once per page view, like the rest of the site's status checks.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUnreadNotificationCount(user.uid)
      .then((count) => { if (!cancelled) setUnreadCount(count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const load = async () => {
    if (!user) return;
    setStatus('loading');
    try {
      const list = await getNotifications(user.uid);
      setItems(list);
      setStatus('idle');
      // The rows keep their "new" look until the panel is opened again.
      if (unreadCount > 0 || list.some((n) => !n.read)) {
        markNotificationsRead(user.uid).then(() => setUnreadCount(0)).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  if (!user) return null;

  const newCount = items.filter((n) => !n.read).length;

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) return;
        // Opening sideways from inside the sidebar: clear its edge instead of
        // covering the name and buttons beside the bell.
        const trigger = triggerRef.current;
        const edge = side === 'right' ? trigger?.closest('aside')?.getBoundingClientRect().right : undefined;
        setSideOffset(trigger && edge ? Math.max(10, edge - trigger.getBoundingClientRect().right + 10) : 10);
        load();
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] data-[state=open]:bg-[var(--bg-subtle)] data-[state=open]:text-[var(--text-primary)]"
        >
          <Bell size={16} aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[18px] tabular-nums text-white ring-2 ring-[var(--bg-card)]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={12}
          aria-label="Notifications"
          className="z-[300] flex max-h-[min(480px,var(--radix-popover-content-available-height))] w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h2>
            {status === 'idle' && newCount > 0 && (
              <span className="text-xs font-medium tabular-nums text-[var(--ink-blue)]">{newCount} new</span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {status === 'loading' ? (
              <ul aria-label="Loading notifications" className="divide-y divide-[var(--border-color)]">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--bg-subtle)] motion-reduce:animate-none" />
                    <span className="flex flex-1 flex-col gap-2 pt-1">
                      <span className="h-3 w-3/4 animate-pulse rounded bg-[var(--bg-subtle)] motion-reduce:animate-none" />
                      <span className="h-3 w-1/2 animate-pulse rounded bg-[var(--bg-subtle)] motion-reduce:animate-none" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : status === 'error' ? (
              <div role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <p className="text-sm text-[var(--text-secondary)]">Couldn't load your notifications.</p>
                <button
                  type="button"
                  onClick={load}
                  className="h-8 cursor-pointer rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  <Bell size={18} aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">You're all caught up</p>
                <p className="mt-1 max-w-[34ch] text-xs leading-[18px] text-[var(--text-secondary)]">
                  Likes on your comments, teacher feedback and new blog posts will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-color)]">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
