import { useRef, useLayoutEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";

gsap.registerPlugin(ScrollTrigger);

const FREE_FEATURES = [
  "All 3 practice modes (Mock, Practice, Relax)",
  "Full question bank access",
  "Word count & timer tools",
  "Writing history",
];

const PRO_FEATURES = [
  "Everything in Free",
  "12 AI analyses per month",
  "Sentence-by-sentence feedback",
  "Vocabulary upgrades with Uzbek meanings",
  "Band score estimate per sentence",
  "Model paragraph",
  "PDF export",
];


const CARD_NUMBER = "9860 1606 4046 4600";
const CARDHOLDER = "PI";
const TELEGRAM_USERNAME = "writeready_admin";

const FONT_SERIF = "[font-family:'Fraunces',serif]";
const FONT_MONO = "[font-family:'IBM_Plex_Mono',monospace]";

type PlanId = "pro";

interface SelectedPlan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  billingNote: string;
}

const PRO_PLAN: SelectedPlan = {
  id: "pro",
  name: "Pro",
  price: "25,000",
  period: "UZS / month",
  billingNote: "Billed monthly · cancel anytime",
};



function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlanGlyphIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6.5.9-4.7 4.6 1.1 6.5L12 17l-5.9 3 1.1-6.5L2.5 8.9 9 8z" />
    </svg>
  );
}


export function PricingPage() {
  const { user, profile } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan>(PRO_PLAN);
  const [copied, setCopied] = useState(false);

  const isFree = !profile || profile.plan === "free";
  const isPro = profile?.plan === "pro";

  const openPaymentModal = (plan: SelectedPlan) => {
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handleCopyCard = async () => {
    try {
      await navigator.clipboard.writeText(CARD_NUMBER.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy card number", err);
    }
  };

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".gs-pricing-header", { y: 32, opacity: 0 });
      gsap.set(".gs-plan-card", { y: 40, opacity: 0, scale: 0.97 });

      gsap.to(".gs-pricing-header", { y: 0, opacity: 1, duration: 0.65, ease: "power3.out", delay: 0.1 });
      gsap.to(".gs-plan-card", {
        scrollTrigger: { trigger: ".gs-plans", start: "top 82%" },
        y: 0, opacity: 1, scale: 1, duration: 0.65, stagger: 0.15, ease: "power2.out",
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <Layout>
      <div ref={rootRef} className="bg-[var(--bg-base)] min-h-[calc(100vh-120px)] py-20">
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="gs-pricing-header text-center mb-14">
            <div className="inline-block bg-blue-50 text-blue-700 text-xs font-bold tracking-[0.08em] uppercase px-4 py-1.5 rounded-[20px] mb-5 dark:bg-blue-900/30 dark:text-blue-300">
              Pricing
            </div>
            <h1 className={`${FONT_SERIF} text-[clamp(2rem,5vw,2.75rem)] font-extrabold text-[var(--text-primary)] mb-3 leading-[1.15]`}>
              Simple, honest pricing
            </h1>
            <p className="text-[var(--text-secondary)] text-[1.0625rem] max-w-[460px] mx-auto">
              Start free. Upgrade when you're ready for AI-powered feedback.
            </p>
          </div>

          {/* Plans */}
          <div className="gs-plans grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6 max-w-[1080px] mx-auto">
            {/* Free plan */}
            <Card className="gs-plan-card hover:-translate-y-2 hover:shadow-2xl transition-all duration-200 p-8 flex flex-col">
              <div className="mb-6">
                <div className={`${FONT_SERIF} text-[1.375rem] font-bold text-[var(--text-primary)] mb-1`}>Free</div>
                <div className="text-sm text-[var(--text-secondary)]">Get started with unlimited writing practice</div>
              </div>
              <div className="mb-8">
                <span className={`${FONT_MONO} text-4xl font-semibold text-[var(--text-primary)]`}>$0</span>
                <span className="text-sm text-[var(--text-secondary)] ml-1.5">forever</span>
              </div>
              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.9rem] text-[var(--text-primary)]">
                    <span className="text-green-500 font-bold shrink-0 mt-px">✓</span>
                    {f}
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-[0.9rem] text-[var(--text-secondary)]">
                  <span className="shrink-0 mt-px">✗</span>
                  No AI feedback
                </li>
              </ul>
              <Link to={user ? "/dashboard" : "/auth?mode=signup"} className="block">
                <Button variant="secondary" className={`w-full ${isFree ? "opacity-[0.55]" : "opacity-100"}`} disabled={isFree}>
                  {isFree ? "Current plan" : "Downgrade to Free"}
                </Button>
              </Link>
            </Card>

            {/* Pro plan */}
            <Card className="gs-plan-card hover:-translate-y-2 hover:shadow-2xl transition-all duration-200 bg-[linear-gradient(135deg,#0f172a,#1e3a5f)] p-8 border-2 border-[#c9900a] shadow-[0_8px_32px_rgba(15,23,42,0.18)] flex flex-col relative">
              <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-[#c9900a] text-white text-[0.6875rem] font-bold tracking-[0.08em] uppercase px-4 py-[0.3rem] rounded-[20px] whitespace-nowrap">
                Most popular
              </div>
              <div className="mb-6">
                <div className={`${FONT_SERIF} text-[1.375rem] font-bold text-white mb-1`}>Pro</div>
                <div className="text-sm text-white/55">AI feedback to accelerate your improvement</div>
              </div>
              <div className="mb-8">
                <span className={`${FONT_MONO} text-4xl font-semibold text-white`}>25,000</span>
                <span className="text-sm text-white/50 ml-1.5">UZS / month</span>
              </div>
              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.9rem] text-white/85">
                    <span className="text-amber-400 font-bold shrink-0 mt-px">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => openPaymentModal(PRO_PLAN)}
                className={`w-full bg-[#c9900a] border-0 hover:bg-[#b8820a] ${isPro ? "opacity-[0.55]" : "opacity-100"}`}
                disabled={isPro}
              >
                {isPro ? "Current plan" : "Get Pro →"}
              </Button>
            </Card>

          </div>
        </div>
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <div
          onClick={() => setShowPaymentModal(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[1000]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--bg-card)] rounded-3xl max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-[var(--shadow-lg)] p-8"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className={`${FONT_SERIF} text-2xl font-extrabold text-[var(--text-primary)] mb-1`}>Complete payment</h2>
                <p className="text-[0.95rem] text-[var(--text-secondary)]">
                  {selectedPlan.name} · {selectedPlan.price} {selectedPlan.period}
                </p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="bg-transparent border-0 cursor-pointer text-[var(--text-secondary)] p-1 hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="border-t border-[var(--border-color)] -mx-8 mb-6" />

            {/* Plan / amount summary */}
            <div className="bg-[var(--bg-subtle)] rounded-2xl p-5 mb-7 border border-[var(--border-color)]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 dark:bg-blue-900/30 dark:text-blue-400">
                    <PlanGlyphIcon />
                  </span>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-0.5">Plan</div>
                    <div className="text-base font-bold text-[var(--text-primary)]">{selectedPlan.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--text-secondary)] mb-0.5">Amount</div>
                  <div className={`${FONT_MONO} text-base font-bold text-[var(--text-primary)]`}>{selectedPlan.price}</div>
                </div>
              </div>

              <div className="border-t border-[var(--border-color)] my-4" />

              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <CheckIcon />
                {selectedPlan.billingNote}
              </div>
            </div>

            {/* Step 1 */}
            <div className="flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">1</span>
              <h3 className="text-[1.05rem] font-bold text-[var(--text-primary)]">Transfer to this card</h3>
            </div>

            <div className="bg-[var(--bg-subtle)] rounded-2xl px-6 py-5 mb-7">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm mb-3">
                <CardIcon />
                Card number
              </div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className={`${FONT_MONO} text-[1.375rem] font-semibold text-[var(--text-primary)] tracking-[0.02em]`}>{CARD_NUMBER}</span>
                <button
                  onClick={handleCopyCard}
                  className="flex items-center gap-1.5 border border-[var(--border-color)] rounded-[20px] px-4 py-2 bg-[var(--bg-card)] text-sm font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <CopyIcon />
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                Cardholder: <strong className="text-[var(--text-primary)]">{CARDHOLDER}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">2</span>
              <h3 className="text-[1.05rem] font-bold text-[var(--text-primary)]">Send the payment receipt</h3>
            </div>

            <p className="text-[0.9375rem] text-[var(--text-secondary)] leading-[1.6] mb-5">
              Send a screenshot of the transfer on Telegram to{" "}
              <strong className="text-[var(--text-primary)]">@{TELEGRAM_USERNAME}</strong>. Your{" "}
              {selectedPlan.name} access will be activated within 24 hours.
            </p>

            <a
              href={`https://t.me/${TELEGRAM_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-[14px] p-3.5 font-bold text-base no-underline mb-5 hover:bg-blue-700 transition-colors"
            >
              <SendIcon />
              Open Telegram
            </a>
          </div>
        </div>
      )}
    </Layout>
  );
}
