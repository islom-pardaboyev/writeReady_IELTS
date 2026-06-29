import { useRef, useLayoutEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";

gsap.registerPlugin(ScrollTrigger);

const CARD_NUMBER = "9860 1606 4046 4600";
const CARDHOLDER = "PI";
const TELEGRAM_USERNAME = "writeready_admin";

const FONT_SERIF = "[font-family:'Fraunces',serif]";
const FONT_MONO = "[font-family:'IBM_Plex_Mono',monospace]";

type PlanId = "basic" | "standard" | "premium";

interface SelectedPlan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  billingNote: string;
}

const PLANS: SelectedPlan[] = [
  { id: "basic", name: "Basic", price: "39,000", period: "so'm / oy", billingNote: "Har oyda to'lov · istalgan vaqt bekor qiling" },
  { id: "standard", name: "Standard", price: "59,000", period: "so'm / oy", billingNote: "Har oyda to'lov · istalgan vaqt bekor qiling" },
  { id: "premium", name: "Premium", price: "89,000", period: "so'm / oy", billingNote: "Har oyda to'lov · istalgan vaqt bekor qiling" },
];

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
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan>(PLANS[1]);
  const [copied, setCopied] = useState(false);

  const currentPlan = profile?.plan ?? "free";

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
        y: 0, opacity: 1, scale: 1, duration: 0.65, stagger: 0.12, ease: "power2.out",
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
              Oddiy va shaffof narxlar
            </h1>
            <p className="text-[var(--text-secondary)] text-[1.0625rem] max-w-[480px] mx-auto">
              Bepul boshlang. AI tahlilga tayyor bo'lgach, o'zingizga mos rejani tanlang.
            </p>
          </div>

          {/* Plans grid */}
          <div className="gs-plans grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6 max-w-[1100px] mx-auto">

            {/* Free */}
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-all duration-200 p-7 flex flex-col">
              <div className="mb-5">
                <div className={`${FONT_SERIF} text-[1.25rem] font-bold text-[var(--text-primary)] mb-1`}>Free</div>
                <div className="text-sm text-[var(--text-secondary)]">Yozish amaliyotini boshlang</div>
              </div>
              <div className="mb-7">
                <span className={`${FONT_MONO} text-3xl font-semibold text-[var(--text-primary)]`}>Bepul</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-green-500 font-bold shrink-0 mt-px">✓</span>1 AI tahlil (bonus)</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-green-500 font-bold shrink-0 mt-px">✓</span>3 ta yozish rejimi (Mock, Practice, Relax)</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-green-500 font-bold shrink-0 mt-px">✓</span>Savolar bazasi</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-green-500 font-bold shrink-0 mt-px">✓</span>PDF eksport</li>
              </ul>
              <Link to={user ? "/dashboard" : "/auth?mode=signup"} className="block">
                <Button variant="secondary" className={`w-full ${currentPlan === "free" ? "opacity-60" : ""}`} disabled={currentPlan === "free"}>
                  {currentPlan === "free" ? "Joriy reja" : "Free rejaga o'tish"}
                </Button>
              </Link>
            </Card>

            {/* Basic */}
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-all duration-200 p-7 flex flex-col">
              <div className="mb-5">
                <div className={`${FONT_SERIF} text-[1.25rem] font-bold text-[var(--text-primary)] mb-1`}>Basic</div>
                <div className="text-sm text-[var(--text-secondary)]">AI tahlilni sinab ko'ring</div>
              </div>
              <div className="mb-7">
                <span className={`${FONT_MONO} text-3xl font-semibold text-[var(--text-primary)]`}>39,000</span>
                <span className="text-sm text-[var(--text-secondary)] ml-1.5">so'm / oy</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>6 AI tahlil/oy</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Batafsil ball tahlili</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Lug'at flashcard'lari</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Grammatika tahlili</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>PDF eksport</li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[0])}
                variant="secondary"
                className={`w-full border-blue-300 hover:border-blue-400 ${currentPlan === "basic" ? "opacity-60" : ""}`}
                disabled={currentPlan === "basic"}
              >
                {currentPlan === "basic" ? "Joriy reja" : "Basic olish →"}
              </Button>
            </Card>

            {/* Standard — Popular */}
            <Card className="gs-plan-card hover:-translate-y-1 transition-all duration-200 p-7 flex flex-col relative border-2 border-blue-500 shadow-[0_8px_32px_rgba(59,130,246,0.18)]">
              <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[0.6875rem] font-bold tracking-[0.08em] uppercase px-4 py-[0.3rem] rounded-[20px] whitespace-nowrap">
                ⭐ Eng mashhur
              </div>
              <div className="mb-5">
                <div className={`${FONT_SERIF} text-[1.25rem] font-bold text-[var(--text-primary)] mb-1`}>Standard</div>
                <div className="text-sm text-[var(--text-secondary)]">Ko'pchilik tanlaydigan reja</div>
              </div>
              <div className="mb-7">
                <span className={`${FONT_MONO} text-3xl font-semibold text-blue-600`}>59,000</span>
                <span className="text-sm text-[var(--text-secondary)] ml-1.5">so'm / oy</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>15 AI tahlil/oy</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Basic dagi barcha imkoniyatlar</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Jumlalar tahlili</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Imlo tekshiruvi</li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]"><span className="text-blue-500 font-bold shrink-0 mt-px">✓</span>Namuna javoblar</li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[1])}
                className={`w-full bg-blue-600 border-0 hover:bg-blue-700 ${currentPlan === "standard" ? "opacity-60" : ""}`}
                disabled={currentPlan === "standard"}
              >
                {currentPlan === "standard" ? "Joriy reja" : "Standard olish →"}
              </Button>
            </Card>

            {/* Premium */}
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-all duration-200 p-7 flex flex-col bg-gradient-to-br from-slate-900 to-[#2d1b69] border-purple-700">
              <div className="mb-5">
                <div className={`${FONT_SERIF} text-[1.25rem] font-bold text-white mb-1`}>Premium</div>
                <div className="text-sm text-white/55">Barcha funksiyalar, maksimal tahlil</div>
              </div>
              <div className="mb-7">
                <span className={`${FONT_MONO} text-3xl font-semibold text-white`}>89,000</span>
                <span className="text-sm text-white/50 ml-1.5">so'm / oy</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-white/85"><span className="text-purple-300 font-bold shrink-0 mt-px">✓</span>30 AI tahlil/oy</li>
                <li className="flex items-start gap-2.5 text-white/85"><span className="text-purple-300 font-bold shrink-0 mt-px">✓</span>Standard dagi barcha imkoniyatlar</li>
                <li className="flex items-start gap-2.5 text-white/85"><span className="text-purple-300 font-bold shrink-0 mt-px">✓</span>Barcha funksiyalar</li>
                <li className="flex items-start gap-2.5 text-white/85"><span className="text-purple-300 font-bold shrink-0 mt-px">✓</span>Ustuvor qo'llab-quvvatlash</li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[2])}
                className={`w-full bg-purple-600 border-0 hover:bg-purple-700 ${currentPlan === "premium" ? "opacity-60" : ""}`}
                disabled={currentPlan === "premium"}
              >
                {currentPlan === "premium" ? "Joriy reja" : "Premium olish →"}
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
                <h2 className={`${FONT_SERIF} text-2xl font-extrabold text-[var(--text-primary)] mb-1`}>To'lovni amalga oshiring</h2>
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
                    <div className="text-xs text-[var(--text-secondary)] mb-0.5">Reja</div>
                    <div className="text-base font-bold text-[var(--text-primary)]">{selectedPlan.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--text-secondary)] mb-0.5">Miqdor</div>
                  <div className={`${FONT_MONO} text-base font-bold text-[var(--text-primary)]`}>{selectedPlan.price} so'm</div>
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
              <h3 className="text-[1.05rem] font-bold text-[var(--text-primary)]">Ushbu kartaga o'tkazing</h3>
            </div>

            <div className="bg-[var(--bg-subtle)] rounded-2xl px-6 py-5 mb-7">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm mb-3">
                <CardIcon />
                Karta raqami
              </div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className={`${FONT_MONO} text-[1.375rem] font-semibold text-[var(--text-primary)] tracking-[0.02em]`}>{CARD_NUMBER}</span>
                <button
                  onClick={handleCopyCard}
                  className="flex items-center gap-1.5 border border-[var(--border-color)] rounded-[20px] px-4 py-2 bg-[var(--bg-card)] text-sm font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <CopyIcon />
                  {copied ? "Nusxalandi!" : "Nusxalash"}
                </button>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                Karta egasi: <strong className="text-[var(--text-primary)]">{CARDHOLDER}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">2</span>
              <h3 className="text-[1.05rem] font-bold text-[var(--text-primary)]">To'lov chekini yuboring</h3>
            </div>

            <p className="text-[0.9375rem] text-[var(--text-secondary)] leading-[1.6] mb-5">
              O'tkazma skrinshotini Telegramda{" "}
              <strong className="text-[var(--text-primary)]">@{TELEGRAM_USERNAME}</strong> ga yuboring. Sizning{" "}
              {selectedPlan.name} obunangiz 24 soat ichida faollashtiriladi.
            </p>

            <a
              href={`https://t.me/${TELEGRAM_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-[14px] p-3.5 font-bold text-base no-underline mb-5 hover:bg-blue-700 transition-colors"
            >
              <SendIcon />
              Telegramni ochish
            </a>
          </div>
        </div>
      )}
    </Layout>
  );
}
