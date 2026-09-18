import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two panes on laptop widths: a 340px record list and the selected record
 * beside it, each scrolling on its own. Below `lg` the detail replaces the
 * list and gets a Back control.
 */
export function ListDetail({
  list,
  detail,
  detailOpen,
  onBack,
  backLabel,
  detailKey,
  label,
  stack = false,
}: {
  list: ReactNode;
  detail: ReactNode;
  detailOpen: boolean;
  onBack: () => void;
  backLabel: string;
  detailKey?: string;
  label: string;
  /** Below `lg`, show list and detail one after the other instead of swapping. */
  stack?: boolean;
}) {
  // Below lg the window scrolls: open the detail at its top, and put the
  // list back where it was when going Back.
  const listScroll = useRef(0);
  useLayoutEffect(() => {
    if (stack || window.innerWidth >= 1024) return;
    if (detailOpen) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, listScroll.current);
    }
  }, [detailOpen, stack]);
  const rememberScroll = () => {
    if (window.innerWidth < 1024) listScroll.current = window.scrollY;
  };

  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden" onClickCapture={detailOpen ? undefined : rememberScroll}>
      <section
        aria-label={label}
        className={cn(
          "border-[var(--border-color)] bg-[var(--bg-card)] lg:flex lg:w-[340px] lg:min-h-0 lg:shrink-0 lg:flex-col lg:border-r",
          stack ? "flex flex-col border-b" : detailOpen ? "hidden" : "flex min-h-[calc(100dvh-49px)] flex-col md:min-h-dvh",
        )}
      >
        {list}
      </section>
      <section
        aria-label="Details"
        className={cn("staff-scroll min-w-0 flex-1 lg:block lg:overflow-y-auto", stack || detailOpen ? "block" : "hidden")}
      >
        <div className={cn("px-4 pt-4 lg:hidden", stack && "hidden")}>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {backLabel}
          </button>
        </div>
        <div key={detailKey} className="staff-detail-in">
          {detail}
        </div>
      </section>
    </div>
  );
}

/** The list pane: title row with the primary action, a toolbar, then rows. */
export function ListPane({
  title,
  count,
  action,
  toolbar,
  children,
  footer,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--border-color)] px-4 pt-5 pb-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            {title}
            {typeof count === "number" && (
              <span className="ml-2 text-sm font-normal tabular-nums text-[var(--text-secondary)]">{count}</span>
            )}
          </h1>
          {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
        </div>
        {toolbar && <div className="flex flex-col gap-2.5">{toolbar}</div>}
      </div>
      <div className="staff-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="shrink-0 border-t border-[var(--border-color)] px-4 py-3">{footer}</div>}
    </>
  );
}

/**
 * Rows container with keyboard travel: Arrow Up/Down (and Home/End) move
 * focus between rows; for single-select lists focus also selects, so the
 * detail pane follows the keyboard.
 */
export function RowList({
  children,
  label,
  selectOnFocus = true,
}: {
  children: ReactNode;
  label: string;
  selectOnFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []);
    if (!rows.length) return;
    const current = rows.findIndex((r) => r === document.activeElement || r.contains(document.activeElement));
    let next = current;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : Math.min(rows.length - 1, current + 1);
    if (e.key === "ArrowUp") next = current < 0 ? 0 : Math.max(0, current - 1);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = rows.length - 1;
    if (next === current) return;
    e.preventDefault();
    rows[next].focus();
    rows[next].scrollIntoView({ block: "nearest" });
    if (selectOnFocus) rows[next].click();
  };

  // One Tab stop per list (the selected row, else the first); arrows move within it.
  useEffect(() => {
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []);
    const selected = rows.findIndex((r) => r.getAttribute("aria-current") === "true");
    const stop = selected >= 0 ? selected : 0;
    rows.forEach((r, i) => { r.tabIndex = i === stop ? 0 : -1; });
  });

  return (
    <div ref={ref} role="list" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-0.5 p-2">
      {children}
    </div>
  );
}

export function ListRow({
  selected,
  onSelect,
  children,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="listitem">
      <button
        type="button"
        data-row
        tabIndex={selected ? 0 : -1}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
          selected ? "bg-[var(--accent)]" : "hover:bg-[var(--bg-subtle)]",
          className,
        )}
      >
        {children}
      </button>
    </div>
  );
}

// ── Detail pane building blocks ──────────────────────────────────────────────
export function DetailView({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[820px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      {footer && (
        <div className="sticky bottom-0 z-10 border-t border-[var(--border-color)] bg-[var(--bg-base)]/95 backdrop-blur-[8px]">
          <div className="mx-auto flex w-full max-w-[820px] flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-10">
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

export function DetailHeader({
  title,
  meta,
  leading,
  badges,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start gap-4">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 break-words text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
          {badges}
        </div>
        {meta && <div className="mt-1 text-sm text-[var(--text-secondary)]">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function DetailSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 border-t border-[var(--border-color)] pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          {description && <p className="mt-0.5 max-w-[65ch] text-sm text-[var(--text-secondary)]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function KeyValues({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-sm text-[var(--text-secondary)]">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-[var(--text-primary)]">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
