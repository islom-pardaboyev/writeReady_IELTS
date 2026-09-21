import { useEffect, type ReactNode } from "react";
import { Layout } from "@/components/layout/Layout";
import { LEGAL } from "@/lib/legal";

interface LegalPageProps {
  title: string;
  /** One sentence under the title, in plain words. */
  intro: string;
  /** Section ids and headings, in the order they appear, for the contents list. */
  sections: { id: string; title: string }[];
  children: ReactNode;
}

/**
 * The shared frame for the Privacy Policy and the Terms: one column, real
 * headings, and a contents list that works as skip navigation on a long page.
 */
export function LegalPage({ title, intro, sections, children }: LegalPageProps) {
  useEffect(() => {
    document.title = `${title} | ${LEGAL.service}`;
  }, [title]);

  return (
    <Layout>
      <article className="mx-auto w-full max-w-[760px] px-6 py-12">
        <header>
          <h1 className="text-[clamp(1.875rem,4vw,2.5rem)] font-black tracking-[-0.02em] text-[var(--text-primary)]">{title}</h1>
          <p className="mt-3 text-[1.0625rem] leading-[1.75] text-[var(--text-secondary)]">{intro}</p>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Last updated {LEGAL.updated}.
          </p>
        </header>

        <nav aria-labelledby="contents-heading" className="mt-8 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <h2 id="contents-heading" className="text-sm font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
            On this page
          </h2>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id} className="text-sm">
                <a
                  href={`#${s.id}`}
                  className="rounded text-[var(--ink-blue)] no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-prose mt-10">{children}</div>
      </article>

      {/* Scoped so the rest of the site keeps its own spacing rules. */}
      <style>{`
        .legal-prose h2 {
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          scroll-margin-top: 1.5rem;
        }
        .legal-prose h3 {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .legal-prose p,
        .legal-prose li {
          font-size: 0.9375rem;
          line-height: 1.8;
          color: var(--text-secondary);
        }
        .legal-prose p { margin-bottom: 0.875rem; }
        .legal-prose ul { list-style: disc; padding-left: 1.25rem; margin-bottom: 0.875rem; }
        .legal-prose li { margin-bottom: 0.375rem; }
        .legal-prose strong { color: var(--text-primary); font-weight: 650; }
        .legal-prose a { color: var(--ink-blue); }
        .legal-prose table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.875rem; }
        .legal-prose th, .legal-prose td {
          border: 1px solid var(--border-color);
          padding: 0.5rem 0.75rem;
          text-align: left;
          vertical-align: top;
          color: var(--text-secondary);
        }
        .legal-prose th { color: var(--text-primary); font-weight: 650; background: var(--bg-subtle); }
      `}</style>
    </Layout>
  );
}
