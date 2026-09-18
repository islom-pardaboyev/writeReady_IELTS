import { useRef, useLayoutEffect, useEffect, useState, useId } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router";
import { X, CreditCard, Copy, Send, Check, Sparkles } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";

gsap.registerPlugin(ScrollTrigger);

const CARD_NUMBER = "9860 1606 4046 4600";
const CARDHOLDER = "PI";
const TELEGRAM_USERNAME = "writeready_admin";
const MIN_TOPUP_UZS = 50000;

const FONT_MONO = "[font-family:'IBM_Plex_Mono',monospace]";

type PlanId = "basic" | "standard" | "premium";

interface SelectedPlan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  billingNote: string;
}

type PaymentTarget =
  | { kind: "plan"; plan: SelectedPlan }
  | { kind: "balance"; amount: number };

const PLANS: SelectedPlan[] = [
  {
    id: "basic",
    name: "Basic",
    price: "19,000",
    period: "UZS / month",
    billingNote: "Monthly payment · cancel anytime",
  },
  {
    id: "standard",
    name: "Standard",
    price: "29,000",
    period: "UZS / month",
    billingNote: "Monthly payment · cancel anytime",
  },
  {
    id: "premium",
    name: "Premium",
    price: "49,000",
    period: "UZS / month",
    billingNote: "Monthly payment · cancel anytime",
  },
];

export function PricingPage() {
  const { user, profile } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [copied, setCopied] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const modalTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!paymentTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPaymentTarget(null);
        return;
      }
      // Keep Tab cycling inside the modal instead of reaching the page behind it.
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === modalRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paymentTarget]);

  useEffect(() => {
    if (paymentTarget) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      modalRef.current?.focus();
    } else {
      lastFocusedRef.current?.focus();
    }
  }, [paymentTarget]);

  const currentPlan = profile?.plan ?? "free";
  const balance = profile?.balanceUZS ?? 0;

  const openPaymentModal = (plan: SelectedPlan) => {
    setPaymentTarget({ kind: "plan", plan });
  };

  const openBalanceTopUp = () => {
    const amount = Number(topUpAmount);
    if (!amount || amount < MIN_TOPUP_UZS) return;
    setPaymentTarget({ kind: "balance", amount });
  };

  const topUpValue = Number(topUpAmount);
  const topUpTooLow = topUpAmount !== "" && topUpValue < MIN_TOPUP_UZS;

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

      gsap.to(".gs-pricing-header", {
        y: 0,
        opacity: 1,
        duration: 0.65,
        ease: "power3.out",
        delay: 0.1,
      });
      gsap.to(".gs-plan-card", {
        scrollTrigger: { trigger: ".gs-plans", start: "top 82%" },
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.65,
        stagger: 0.12,
        ease: "power2.out",
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <Layout>
      <div
        ref={rootRef}
        className="bg-[var(--bg-base)] min-h-[calc(100vh-120px)] py-20"
      >
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="gs-pricing-header text-center mb-14">
            <div className="inline-block bg-indigo-50 text-indigo-700 text-xs font-bold tracking-[0.08em] uppercase px-4 py-1.5 rounded-[20px] mb-5 dark:bg-indigo-900/30 dark:text-indigo-300">
              Pricing
            </div>
            <h1
              className={`text-[clamp(2rem,5vw,2.75rem)] font-extrabold text-[var(--text-primary)] mb-3 leading-[1.15]`}
            >
              Simple, transparent pricing
            </h1>
            <p className="text-[var(--text-secondary)] text-[1.0625rem] max-w-[480px] mx-auto">
              Start for free. When you&rsquo;re ready for AI feedback, choose the plan
              that fits you.
            </p>
          </div>

          {/* Plans grid */}
          <div className="gs-plans grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6 max-w-[1100px] mx-auto">
            {/* Free */}
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-[transform,box-shadow] duration-200 p-7 flex flex-col">
              <div className="mb-5">
                <div
                  className={`text-[1.25rem] font-bold text-[var(--text-primary)] mb-1`}
                >
                  Free
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Start practising for free
                </div>
              </div>
              <div className="mb-7">
                <span
                  className={`${FONT_MONO} text-3xl font-semibold text-[var(--text-primary)]`}
                >
                  Free
                </span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-green-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  1 AI analysis per week
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-green-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  All 4 writing modes
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-green-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Question bank + PDF export
                </li>
              </ul>
              <Link
                to={user ? "/dashboard" : "/auth?mode=signup"}
                className="block"
              >
                <Button
                  variant="secondary"
                  className={`w-full ${currentPlan === "free" ? "opacity-60" : ""}`}
                  disabled={currentPlan === "free"}
                >
                  {currentPlan === "free" ? "Current plan" : "Switch to Free"}
                </Button>
              </Link>
            </Card>

            {/* Basic */}
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-[transform,box-shadow] duration-200 p-7 flex flex-col">
              <div className="mb-5">
                <div
                  className={`text-[1.25rem] font-bold text-[var(--text-primary)] mb-1`}
                >
                  Basic
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Try AI feedback
                </div>
              </div>
              <div className="mb-7">
                <span
                  className={`${FONT_MONO} text-3xl font-semibold text-[var(--text-primary)]`}
                >
                  19,000
                </span>
                <span className="text-sm text-[var(--text-secondary)] ml-1.5">
                  UZS / month
                </span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-indigo-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  5 AI analyses / month
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-indigo-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Full band-score & sentence-level feedback
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-indigo-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Vocabulary & grammar practice
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-indigo-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Sample essay + PDF export
                </li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[0])}
                variant="secondary"
                className={`w-full border-indigo-300 hover:border-indigo-400 ${currentPlan === "basic" ? "opacity-60" : ""}`}
                disabled={currentPlan === "basic"}
              >
                {currentPlan === "basic" ? "Current plan" : "Get Basic →"}
              </Button>
            </Card>

            {/* Standard — Popular */}
            <Card className="gs-plan-card hover:-translate-y-1 transition-[transform,box-shadow] duration-200 p-7 flex flex-col relative border-2 border-[var(--ink-blue)] shadow-[0_8px_32px_rgba(79,70,229,0.18)]">
              <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-[var(--ink-blue)] text-white text-[0.6875rem] font-bold tracking-[0.08em] uppercase px-4 py-[0.3rem] rounded-[20px] whitespace-nowrap">
                ⭐ Most popular
              </div>
              <div className="mb-5">
                <div
                  className={`text-[1.25rem] font-bold text-[var(--text-primary)] mb-1`}
                >
                  Standard
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Most popular choice
                </div>
              </div>
              <div className="mb-7">
                <span
                  className={`${FONT_MONO} text-3xl font-semibold text-[var(--ink-blue)]`}
                >
                  29,000
                </span>
                <span className="text-sm text-[var(--text-secondary)] ml-1.5">
                  UZS / month
                </span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-indigo-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  12 AI analyses / month
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-indigo-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Everything in Basic
                </li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[1])}
                className={`w-full bg-[var(--ink-blue)] border-0 hover:opacity-90 ${currentPlan === "standard" ? "opacity-60" : ""}`}
                disabled={currentPlan === "standard"}
              >
                {currentPlan === "standard" ? "Current plan" : "Get Standard →"}
              </Button>
            </Card>

            {/* Premium */}
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-[transform,box-shadow] duration-200 p-7 flex flex-col bg-linear-to-br from-slate-900 to-[#312E81] border-indigo-800">
              <div className="mb-5">
                <div
                  className={`text-[1.25rem] font-bold text-white mb-1`}
                >
                  Premium
                </div>
                <div className="text-sm text-white/55">
                  All features, maximum analyses
                </div>
              </div>
              <div className="mb-7">
                <span
                  className={`${FONT_MONO} text-3xl font-semibold text-white`}
                >
                  49,000
                </span>
                <span className="text-sm text-white/50 ml-1.5">
                  UZS / month
                </span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-white/85">
                  <span className="text-indigo-300 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  25 AI analyses / month (highest)
                </li>
                <li className="flex items-start gap-2.5 text-white/85">
                  <span className="text-indigo-300 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Everything in Basic & Standard
                </li>
                <li className="flex items-start gap-2.5 text-white/85">
                  <span className="text-indigo-300 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Priority support
                </li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[2])}
                className={`w-full bg-[var(--ink-blue)] border-0 hover:opacity-90 ${currentPlan === "premium" ? "opacity-60" : ""}`}
                disabled={currentPlan === "premium"}
              >
                {currentPlan === "premium" ? "Current plan" : "Get Premium →"}
              </Button>
            </Card>
          </div>

          {/* Balance top-up */}
          {user && (
            <div className="gs-plan-card max-w-[560px] mx-auto mt-10 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-7">
              <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <div className={`text-lg font-bold text-[var(--text-primary)]`}>
                    Account Balance
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Used for pay-per-use features like Human Check
                  </div>
                </div>
                <div className={`${FONT_MONO} text-2xl font-bold text-emerald-600`}>
                  {balance.toLocaleString()} UZS
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input autoComplete="off"
                  name="top-up-amount"
                  type="number"
                  min={MIN_TOPUP_UZS}
                  step="1000"
                  aria-label={`Top-up amount in UZS, minimum ${MIN_TOPUP_UZS.toLocaleString()}`}
                  placeholder={`Amount (min ${MIN_TOPUP_UZS.toLocaleString()} UZS)…`}
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className={`flex-1 min-w-[160px] h-11 px-4 rounded-xl border bg-[var(--bg-base)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--ink-blue)] ${topUpTooLow ? "border-red-400" : "border-[var(--border-color)]"}`}
                />
                <Button
                  onClick={openBalanceTopUp}
                  disabled={!topUpAmount || topUpValue < MIN_TOPUP_UZS}
                  className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                >
                  Top Up →
                </Button>
              </div>
              <p className={`text-xs mt-2 ${topUpTooLow ? "text-red-500" : "text-[var(--text-secondary)]"}`}>
                Minimum top-up is {MIN_TOPUP_UZS.toLocaleString()} UZS. Enter any amount above that.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Payment modal */}
      {paymentTarget && (
        <div
          onClick={() => setPaymentTarget(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[1000]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            ref={modalRef}
            tabIndex={-1}
            className="bg-[var(--bg-card)] rounded-3xl max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-[var(--shadow-lg)] p-8 outline-none"
            style={{ overscrollBehavior: "contain" }}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2
                  id={modalTitleId}
                  className={`text-2xl font-extrabold text-[var(--text-primary)] mb-1`}
                >
                  Complete payment
                </h2>
                <p className="text-[0.95rem] text-[var(--text-secondary)]">
                  {paymentTarget.kind === "balance"
                    ? `Balance Top-up · ${paymentTarget.amount.toLocaleString()} UZS`
                    : `${paymentTarget.plan.name} · ${paymentTarget.plan.price} ${paymentTarget.plan.period}`}
                </p>
              </div>
              <button
                onClick={() => setPaymentTarget(null)}
                className="bg-transparent border-0 cursor-pointer text-[var(--text-secondary)] p-1 hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-t border-[var(--border-color)] -mx-8 mb-6" />

            {/* Plan / amount summary */}
            <div className="bg-[var(--bg-subtle)] rounded-2xl p-5 mb-7 border border-[var(--border-color)]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-indigo-50 text-[var(--ink-blue)] flex items-center justify-center shrink-0 dark:bg-indigo-900/30 dark:text-indigo-400">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-0.5">
                      {paymentTarget.kind === "balance" ? "Top-up" : "Plan"}
                    </div>
                    <div className="text-base font-bold text-[var(--text-primary)]">
                      {paymentTarget.kind === "balance" ? "Account Balance" : paymentTarget.plan.name}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--text-secondary)] mb-0.5">
                    Amount
                  </div>
                  <div
                    className={`${FONT_MONO} text-base font-bold text-[var(--text-primary)]`}
                  >
                    {paymentTarget.kind === "balance" ? paymentTarget.amount.toLocaleString() : paymentTarget.plan.price} UZS
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border-color)] my-4" />

              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Check size={13} strokeWidth={3} />
                {paymentTarget.kind === "balance" ? "One-time balance top-up" : paymentTarget.plan.billingNote}
              </div>
            </div>

            {/* Step 1 */}
            <div className="flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-[var(--ink-blue)] text-white flex items-center justify-center font-bold text-sm shrink-0">
                1
              </span>
              <h3 className="text-[1.05rem] font-bold text-[var(--text-primary)]">
                Transfer to this card
              </h3>
            </div>

            <div className="bg-[var(--bg-subtle)] rounded-2xl px-6 py-5 mb-7">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm mb-3">
                <CreditCard size={16} />
                Card number
              </div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span
                  className={`${FONT_MONO} text-[1.375rem] font-semibold text-[var(--text-primary)] tracking-[0.02em]`}
                >
                  {CARD_NUMBER}
                </span>
                <button
                  onClick={handleCopyCard}
                  className="flex items-center gap-1.5 border border-[var(--border-color)] rounded-[20px] px-4 py-2 bg-[var(--bg-card)] text-sm font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <Copy size={15} />
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                Cardholder:{" "}
                <strong className="text-[var(--text-primary)]">
                  {CARDHOLDER}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-[var(--ink-blue)] text-white flex items-center justify-center font-bold text-sm shrink-0">
                2
              </span>
              <h3 className="text-[1.05rem] font-bold text-[var(--text-primary)]">
                Send payment receipt
              </h3>
            </div>

            <p className="text-[0.9375rem] text-[var(--text-secondary)] leading-[1.6] mb-5">
              Send a screenshot of the transfer to{" "}
              <strong className="text-[var(--text-primary)]">
                @{TELEGRAM_USERNAME}
              </strong>{" "}
              on Telegram.{" "}
              {paymentTarget.kind === "balance"
                ? "Your balance will be topped up within 24 hours."
                : `Your ${paymentTarget.plan.name} subscription will be activated within 24 hours.`}
            </p>

            <a
              href={`https://t.me/${TELEGRAM_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[var(--ink-blue)] text-white rounded-[14px] p-3.5 font-bold text-base no-underline mb-5 hover:opacity-90 transition-colors"
            >
              <Send size={18} />
              Open Telegram
            </a>
          </div>
        </div>
      )}
    </Layout>
  );
}
