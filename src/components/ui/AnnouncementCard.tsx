import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import type { Announcement } from "@/firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import {
  categoryOf,
  loadAnnouncements,
  markAnnouncementsSeen,
  paragraphs,
  sitePath,
  useSeenAnnouncements,
} from "@/lib/announcements";
import { cn } from "@/lib/utils";

// Pages where a card would get in the way: writing and exam screens, sign-in,
// and the staff portals.
const HIDDEN_ON = ["/writing", "/auth", "/admin", "/center-admin", "/teacher-portal"];

// Long enough for the page to settle before the card slides in.
const SHOW_AFTER_MS = 1200;
const EXIT_MS = 200;

/**
 * The newest announcement this browser hasn't read yet, as a card in the
 * bottom-left corner, for signed-in students only; visitors without an
 * account never see it. It never blocks the page or takes focus, stays across
 * page changes until it's dismissed, and remains in the notification bell
 * afterwards. After one is dismissed, the next unread one waits for the next
 * visit, so students aren't handed a queue.
 */
export function AnnouncementCard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const signedIn = !!user;
  const seen = useSeenAnnouncements();
  const titleId = useId();
  const [items, setItems] = useState<Announcement[]>([]);
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dismissedThisVisit, setDismissedThisVisit] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    loadAnnouncements()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {});
    const timer = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signedIn]);

  const current = items.find((a) => !seen.has(a.id));

  useEffect(() => {
    if (!closing || !current) return;
    const id = current.id;
    const timer = window.setTimeout(() => {
      markAnnouncementsSeen([id]);
      setDismissedThisVisit(true);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, current]);

  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const visible = signedIn && ready && !!current && !hidden && !dismissedThisVisit;

  const dismiss = () => setClosing(true);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      dismiss();
    }
  };

  const meta = current ? categoryOf(current) : null;
  const Icon = meta?.icon;
  const title = current ? current.title || current.text : "";
  const body = current?.title ? current.text : "";
  const link = current?.link?.trim() ?? "";
  const path = link ? sitePath(link) : null;
  const linkLabel = current?.linkLabel?.trim() || "Learn more";

  const actionClass =
    "inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--ink-blue)] px-3 text-xs font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] dark:text-[var(--primary-foreground)] cursor-pointer";

  return (
    <>
      {/* Read out once when the card appears; the card itself never takes focus. */}
      <p className="sr-only" aria-live="polite">
        {visible && meta ? `New ${meta.label.toLowerCase()}: ${title}` : ""}
      </p>

      {visible && current && meta && Icon && (
        <section
          key={current.id}
          aria-labelledby={titleId}
          onKeyDown={onKeyDown}
          className={cn(
            "fixed inset-x-4 bottom-[5.5rem] z-[250] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[380px]",
            "rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]",
            "transition-[opacity,translate,scale] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            "starting:translate-y-4 starting:scale-[0.98] starting:opacity-0",
            "motion-reduce:transition-none",
            closing && "translate-y-2 opacity-0 duration-200 ease-in",
          )}
        >
          <div className="flex gap-3.5 py-4 pl-4 pr-2.5">
            <span
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.tint)}
              title={meta.label}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="sr-only">{meta.label}</span>
            </span>

            <div className="min-w-0 flex-1 pt-1.5">
              <h2
                id={titleId}
                className="text-base font-semibold leading-snug tracking-[-0.01em] text-balance text-[var(--text-primary)]"
              >
                {title}
              </h2>
              {body && (
                <div className="mt-1.5 flex max-h-44 flex-col gap-2 overflow-y-auto overscroll-contain text-sm leading-relaxed text-[var(--text-secondary)]">
                  {paragraphs(body).map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {p}
                    </p>
                  ))}
                </div>
              )}
              {link && (
                <div className="mt-3.5">
                  {path ? (
                    <button
                      type="button"
                      className={actionClass}
                      onClick={() => {
                        navigate(path);
                        dismiss();
                      }}
                    >
                      {linkLabel}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    <a href={link} target="_blank" rel="noopener noreferrer" className={actionClass} onClick={dismiss}>
                      {linkLabel}
                      <ExternalLink size={14} aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss announcement"
              title="Dismiss"
              className="-mt-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </>
  );
}
