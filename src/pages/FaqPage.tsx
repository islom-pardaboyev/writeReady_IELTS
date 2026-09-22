import { useEffect } from "react";
import { Link } from "react-router";
import { Layout } from "@/components/layout/Layout";
import { FaqAccordion, FaqAnswerStyles } from "@/components/ui/FaqAccordion";
import { GROUPS, faqJsonLd } from "@/lib/faq";
import { LEGAL, TELEGRAM_CONTACT_URL } from "@/lib/legal";

export function FaqPage() {
  useEffect(() => {
    document.title = `Questions and answers | ${LEGAL.service}`;
  }, []);

  return (
    <Layout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />

      <div className="mx-auto w-full max-w-[760px] px-6 py-12">
        <header>
          <h1 className="text-[clamp(1.875rem,4vw,2.5rem)] font-black tracking-[-0.02em] text-[var(--text-primary)]">
            Questions and answers
          </h1>
          <p className="mt-3 text-[1.0625rem] leading-[1.75] text-[var(--text-secondary)]">
            What WriteReady does, what it costs, and what the AI feedback is worth. Anything missing?{" "}
            <a href={TELEGRAM_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--ink-blue)]">
              Ask us on Telegram
            </a>
            .
          </p>
        </header>

        {GROUPS.map((group) => (
          <section key={group.title} className="mt-10">
            <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{group.title}</h2>

            <FaqAccordion items={group.items} className="mt-3" />
          </section>
        ))}

        <p className="mt-10 text-sm text-[var(--text-secondary)]">
          See also the <Link to="/terms">Terms of Service</Link> and the <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>

      <FaqAnswerStyles />
    </Layout>
  );
}
