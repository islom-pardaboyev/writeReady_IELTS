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
      className={`faq-accordion divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] ${className}`}
    >
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded font-semibold text-[var(--text-primary)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2">
            <span>{item.q}</span>
            <span
              aria-hidden="true"
              className="shrink-0 text-xl leading-none text-[var(--text-secondary)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>
          <div className="faq-answer pt-3 pb-1 text-[0.9375rem] leading-[1.8] text-[var(--text-secondary)]">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/**
 * The answer styles and the drop animation, kept next to the markup they
 * belong to.
 *
 * The drop is done in two layers, because ::details-content is newer than the
 * oldest browsers this site still serves:
 *
 *   1. ::details-content animates the height, so the rest of the page slides
 *      down with the answer instead of jumping the moment it opens. It needs
 *      `interpolate-size: allow-keywords` for `height: auto` to be animatable,
 *      and a discrete transition on content-visibility so the answer stays on
 *      screen while it closes again. Both are required together, so the rule
 *      sits behind an @supports for both: half-support would collapse the
 *      answer to nothing and never open it.
 *   2. A keyframe fades and slides the answer itself. This runs in every
 *      browser, so even one without ::details-content still gets the movement.
 *
 * A browser with neither opens the answer instantly, which is what all of them
 * did before. Nothing here is load-bearing: the accordion is still plain
 * <details>, so it works with JavaScript off and answers find-in-page.
 */
export function FaqAnswerStyles() {
  return (
    <style>{`
      .faq-answer a { color: var(--ink-blue); }
      .faq-answer p + p { margin-top: 0.75rem; }
      .faq-answer ul { list-style: disc; padding-left: 1.25rem; }
      .faq-answer li { margin-bottom: 0.375rem; }
      .faq-answer strong { color: var(--text-primary); font-weight: 650; }

      .faq-accordion { interpolate-size: allow-keywords; }

      @media (prefers-reduced-motion: no-preference) {
        .faq-accordion details[open] .faq-answer {
          animation: faq-answer-drop 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* Collapsing the answer to height 0 is only safe where the browser can
           animate back out of it. Both conditions are required: without
           interpolate-size, height never leaves 0 and the answer would be
           stuck shut. If either is missing this whole block is skipped and
           <details> opens natively, which is what it did before. */
        @supports (interpolate-size: allow-keywords) and selector(::details-content) {
          .faq-accordion details::details-content {
            height: 0;
            overflow: hidden;
            transition:
              height 300ms cubic-bezier(0.22, 1, 0.36, 1),
              content-visibility 300ms allow-discrete;
          }
          .faq-accordion details[open]::details-content { height: auto; }
        }
      }

      @keyframes faq-answer-drop {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: none; }
      }
    `}</style>
  );
}
