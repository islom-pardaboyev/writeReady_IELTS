import type { Qa } from "@/lib/faq";

/**
 * A list of questions that open and close. Built on <details>, so it answers to
 * the keyboard, to screen readers and to the browser's own find-in-page without
 * any JavaScript of ours.
 *
 * Shared by the home page and /faq so both read the same, in both themes.
 */
export function FaqAccordion({ items, className = "" }: { items: Qa[]; className?: string }) {
  return (
    <div
      className={`divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] ${className}`}
    >
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4 [&[open]]:pb-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded font-semibold text-[var(--text-primary)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2">
            <span>{item.q}</span>
            <span
              aria-hidden="true"
              className="shrink-0 text-xl leading-none text-[var(--text-secondary)] transition-transform group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>
          <div className="faq-answer mt-3 text-[0.9375rem] leading-[1.8] text-[var(--text-secondary)]">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/** The answer styles, kept next to the markup they belong to. */
export function FaqAnswerStyles() {
  return (
    <style>{`
      .faq-answer a { color: var(--ink-blue); }
      .faq-answer p + p { margin-top: 0.75rem; }
      .faq-answer ul { list-style: disc; padding-left: 1.25rem; }
      .faq-answer li { margin-bottom: 0.375rem; }
      .faq-answer strong { color: var(--text-primary); font-weight: 650; }
    `}</style>
  );
}
