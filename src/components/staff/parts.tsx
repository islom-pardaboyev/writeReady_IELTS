import { useEffect, type ReactNode, type RefObject } from "react";
import { CircleCheck, Info, Search, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";

// ── Form field: label above, hint or error below ────────────────────────────
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--text-primary)]">
        {label}
        {optional && <span className="font-normal text-[var(--text-secondary)]"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--text-secondary)]">{hint}</p>
      ) : null}
    </div>
  );
}

export const selectClass =
  "h-10 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1";

// ── Inline notice ────────────────────────────────────────────────────────────
const NOTICE_TONES = {
  success: { icon: CircleCheck, cls: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200" },
  error: { icon: TriangleAlert, cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" },
  warning: { icon: TriangleAlert, cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200" },
  info: { icon: Info, cls: "border-[var(--border-color)] bg-[var(--bg-subtle)] text-[var(--text-primary)]" },
} as const;

export function Notice({
  tone,
  children,
  className,
}: {
  tone: keyof typeof NOTICE_TONES;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = NOTICE_TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", cls, className)}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── Switch ───────────────────────────────────────────────────────────────────
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-[var(--ink-blue)]" : "bg-[var(--border-strong)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform duration-200 motion-reduce:transition-none",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ── Number strip (hairline grid of figures) ──────────────────────────────────
export interface StatItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
}

export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  // Flex-wrap instead of a fixed grid: when tiles wrap, the last row stretches
  // to fill, so there is never an empty cell.
  return (
    <div
      className={cn(
        "flex flex-wrap gap-px overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--border-color)] [&>*]:min-w-[150px] [&>*]:flex-1 [&>*]:basis-[150px]",
        className,
      )}
    >
      {items.map((s) => {
        const body = (
          <>
            <span className="block text-sm text-[var(--text-secondary)]">{s.label}</span>
            <span className="mt-1 block font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{s.value}</span>
            {s.hint && <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{s.hint}</span>}
          </>
        );
        return s.onClick ? (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            className="bg-[var(--bg-card)] px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
          >
            {body}
          </button>
        ) : (
          <div key={s.label} className="bg-[var(--bg-card)] px-5 py-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}

// ── Filter chips ─────────────────────────────────────────────────────────────
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active
                ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
            )}
          >
            {o.label}
            {typeof o.count === "number" && <span className="tabular-nums opacity-80">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Search field ("/" focuses it) ────────────────────────────────────────────
export function SearchField({
  value,
  onChange,
  placeholder,
  inputRef,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  label: string;
}) {
  useEffect(() => {
    if (!inputRef) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']"))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputRef]);

  return (
    <div className="relative">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
      <Input
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-9 pr-9"
      />
      {inputRef && !value && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--border-color)] px-1.5 font-mono text-[0.7rem] text-[var(--text-secondary)] lg:block">
          /
        </kbd>
      )}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {children && <p className="mt-1 max-w-[42ch] text-sm text-[var(--text-secondary)] text-balance">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Failed load: never show a false empty state ─────────────────────────────
export function LoadError({ what, onRetry, className }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title={`Could not load ${what}`}
      className={className}
      action={<Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    >
      The request failed. Check your connection, then try again.
    </EmptyState>
  );
}

// ── Loading placeholders shaped like list rows ──────────────────────────────
export function RowSkeletons({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1 p-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg px-3 py-3">
          <div className="h-3.5 w-3/5 animate-pulse rounded bg-[var(--bg-subtle)] motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-[var(--bg-subtle)] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

// ── Panel (one level of elevation for home and settings pages) ──────────────
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]", className)}>
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{description}</p>}
        </div>
        {action}
      </header>
      <div className={cn("px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

// ── Page heading for non list-detail pages ──────────────────────────────────
export function PageHeading({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── File picker styled as an outline button ─────────────────────────────────
export function FileButton({
  accept,
  onFile,
  disabled,
  children,
  className,
}: {
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[var(--bg-card)]",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {children}
    </label>
  );
}

// ── Avatar with initials (neutral, brand-tinted) ────────────────────────────
export function Initials({ name, size = 36, src }: { name: string; size?: number; src?: string }) {
  const letters = name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (src) {
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-semibold text-[var(--accent-foreground)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {letters}
    </span>
  );
}
