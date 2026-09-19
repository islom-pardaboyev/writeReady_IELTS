import { ALT_LABEL, keyLabel } from "@/lib/shortcuts";

const KEY_CLASS =
  "inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md border border-[var(--border-color)] border-b-2 bg-[var(--bg-subtle)] font-mono text-xs font-semibold text-[var(--text-primary)]";

/** A key or key combination drawn as keycaps: pass a code for Alt + that key. */
export function ShortcutKeys({ code, keys }: { code?: string; keys?: string[] }) {
  const caps = keys ?? (code ? [ALT_LABEL, keyLabel(code)] : []);
  return (
    <span className="inline-flex items-center gap-1">
      {caps.map((k, i) => (
        <kbd key={i} className={KEY_CLASS}>
          {k}
        </kbd>
      ))}
    </span>
  );
}
