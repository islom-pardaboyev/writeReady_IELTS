import { useRef, useLayoutEffect, useEffect, useState, useId } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router";
import { X, Copy, Send, Check } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { CUSTOM_PLAN_PRICES, PLAN_INFO, customPriceFor } from "../lib/plans";

gsap.registerPlugin(ScrollTrigger);

const CARD_NUMBER = "9860 1606 4046 4600";
const CARDHOLDER = "PI";
const TELEGRAM_USERNAME = "writeready_admin";
const MIN_TOPUP_UZS = 50000;

const FONT_MONO = "[font-family:'IBM_Plex_Mono',monospace]";

type PlanId = "basic" | "standard" | "premium";

/**
 * What one analysis works out at on each plan: the monthly price divided by
 * the analyses in it. It is a comparison, not a separate charge. Worked out
 * from PLAN_INFO, so it follows any price change. Savings compare with Basic
 * and round DOWN, so the page never claims more than a student can save
 * (48.4% shows as 48%); "up to" because they assume the whole month is used.
 */
const perAnalysis = (id: PlanId) => PLAN_INFO[id].monthlyPriceUZS / PLAN_INFO[id].monthlyAnalyses;
const perAnalysisText = (id: PlanId) => {
  const exact = perAnalysis(id);
  const shown = (Math.round(exact / 10) * 10).toLocaleString("en-US");
  return Number.isInteger(exact / 10) ? shown : `≈ ${shown}`;
};
const savingVsBasic = (id: PlanId) => Math.floor((1 - perAnalysis(id) / perAnalysis("basic")) * 100);

const customPerAnalysisText = (price: number, analyses: number) => {
  const exact = price / analyses;
  const shown = (Math.round(exact / 10) * 10).toLocaleString("en-US");
  return Number.isInteger(exact / 10) ? shown : `≈ ${shown}`;
};

interface SelectedPlan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  billingNote: string;
}

type PaymentTarget =
  | { kind: "plan"; plan: SelectedPlan }
  | { kind: "balance"; amount: number }
  | { kind: "custom"; analyses: number; price: number };

interface Receipt {
  item: string;
  detail: string;
  amount: number;
  billing: string;
  done: string;
}

const uzsFigure = (n: number) => n.toLocaleString("en-US");

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
  const [customAnalyses, setCustomAnalyses] = useState(10);
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

  const customPrice = customPriceFor(customAnalyses);
  // A student already on the Customizable plan starts from their own number.
  const ownCustom = currentPlan === "custom" ? profile?.customAnalyses : undefined;
  useEffect(() => {
    if (ownCustom) setCustomAnalyses(ownCustom);
  }, [ownCustom]);

  const openCustomPayment = () => {
    setPaymentTarget({ kind: "custom", analyses: customAnalyses, price: customPrice });
  };

  const receipt: Receipt | null = !paymentTarget
    ? null
    : paymentTarget.kind === "balance"
    ? {
        item: "Balance top-up",
        detail: "For Human Check and other pay-per-use features",
        amount: paymentTarget.amount,
        billing: "One-time payment",
        done: "We top up your balance",
      }
    : paymentTarget.kind === "custom"
    ? {
        item: "Customizable plan",
        detail: `${paymentTarget.analyses} AI analyses a month`,
        amount: paymentTarget.price,
        billing: "Monthly · cancel anytime",
        done: "We activate your Customizable plan",
      }
    : {
        item: `${paymentTarget.plan.name} plan`,
        detail: `${PLAN_INFO[paymentTarget.plan.id].monthlyAnalyses} AI analyses a month`,
        amount: PLAN_INFO[paymentTarget.plan.id].monthlyPriceUZS,
        billing: "Monthly · cancel anytime",
        done: `We activate your ${paymentTarget.plan.name} plan`,
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
            <div className="inline-block bg-brand-50 text-brand-700 text-xs font-bold tracking-[0.08em] uppercase px-4 py-1.5 rounded-[20px] mb-5 dark:bg-brand-900/30 dark:text-brand-300">
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
                  1 AI analysis per week (one essay)
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
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  That&rsquo;s {perAnalysisText("basic")} UZS per analysis
                </p>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-brand-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  5 AI analyses / month
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-brand-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Full band-score & sentence-level feedback
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-brand-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Vocabulary & grammar practice
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-brand-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Sample essay + PDF export
                </li>
              </ul>
              <Button
                onClick={() => openPaymentModal(PLANS[0])}
                variant="secondary"
                className={`w-full border-brand-300 hover:border-brand-400 ${currentPlan === "basic" ? "opacity-60" : ""}`}
                disabled={currentPlan === "basic"}
              >
                {currentPlan === "basic" ? "Current plan" : "Get Basic →"}
              </Button>
            </Card>

            {/* Standard — Popular */}
            <Card className="gs-plan-card hover:-translate-y-1 transition-[transform,box-shadow] duration-200 p-7 flex flex-col relative border-2 border-[var(--ink-blue)] shadow-[0_8px_32px_color-mix(in_srgb,var(--ink-blue-solid)_18%,transparent)]">
              <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-[var(--ink-blue-solid)] text-white text-[0.6875rem] font-bold tracking-[0.08em] uppercase px-4 py-[0.3rem] rounded-[20px] whitespace-nowrap">
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
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  That&rsquo;s {perAnalysisText("standard")} UZS per analysis ·{" "}
                  <span className="whitespace-nowrap font-semibold text-[var(--ink-blue)]">save up to {savingVsBasic("standard")}%</span>
                </p>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-brand-500 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  12 AI analyses / month
                </li>
                <li className="flex items-start gap-2.5 text-[var(--text-primary)]">
                  <span className="text-brand-500 font-bold shrink-0 mt-px">
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
            <Card className="gs-plan-card hover:-translate-y-1 hover:shadow-xl transition-[transform,box-shadow] duration-200 p-7 flex flex-col relative bg-linear-to-br from-slate-900 to-brand-900 border-brand-800">
              <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-[var(--gold)] text-slate-900 text-[0.6875rem] font-bold tracking-[0.08em] uppercase px-4 py-[0.3rem] rounded-[20px] whitespace-nowrap">
                Best value · save up to {savingVsBasic("premium")}%
              </div>
              <div className="mb-5">
                <div
                  className={`text-[1.25rem] font-bold text-white mb-1`}
                >
                  Premium
                </div>
                <div className="text-sm text-white/75">
                  All features, maximum analyses
                </div>
              </div>
              <div className="mb-7">
                <span
                  className={`${FONT_MONO} text-3xl font-semibold text-white`}
                >
                  49,000
                </span>
                <span className="text-sm text-white/75 ml-1.5">
                  UZS / month
                </span>
                <p className="mt-1.5 text-xs text-white/75">
                  That&rsquo;s just {perAnalysisText("premium")} UZS per analysis ·{" "}
                  <span className="whitespace-nowrap font-semibold text-amber-300">save up to {savingVsBasic("premium")}%</span>
                </p>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1 text-[0.875rem]">
                <li className="flex items-start gap-2.5 text-white/85">
                  <span className="text-brand-300 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  25 AI analyses / month (highest)
                </li>
                <li className="flex items-start gap-2.5 text-white/85">
                  <span className="text-brand-300 font-bold shrink-0 mt-px">
                    ✓
                  </span>
                  Everything in Basic & Standard
                </li>
                <li className="flex items-start gap-2.5 text-white/85">
                  <span className="text-brand-300 font-bold shrink-0 mt-px">
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
          <p className="mx-auto mt-5 max-w-[68ch] text-center text-xs leading-relaxed text-[var(--text-secondary)]">
            The price per analysis is the monthly price divided by the analyses in the plan; you still pay monthly.
            Savings compare with Basic and assume you use all of the month&rsquo;s analyses.
          </p>

          {/* Customizable plan */}
          <div className="gs-plan-card max-w-[640px] mx-auto mt-10 bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-color)] rounded-2xl p-7">
            <div className="mb-1">
              <div className="text-lg font-bold text-[var(--text-primary)]">
                Customizable
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                {ownCustom
                  ? `You're on ${ownCustom} analyses a month. Pick another number to change it.`
                  : "None of the three fit? Pick the exact number of analyses you need."}
              </div>
            </div>

            <div className="mt-5 max-h-[280px] overflow-y-auto rounded-xl border border-[var(--border-color)]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-subtle)]">
                  <tr>
                    <th className="w-10"></th>
                    <th className="text-left font-semibold text-[var(--text-secondary)] py-2.5 px-3">
                      AI analyses / month
                    </th>
                    <th className={`${FONT_MONO} text-right font-semibold text-[var(--text-secondary)] py-2.5 px-3`}>
                      Price / month
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CUSTOM_PLAN_PRICES.map(({ analyses, price }) => {
                    const inputId = `custom-analyses-${analyses}`;
                    const isSelected = analyses === customAnalyses;
                    return (
                      <tr
                        key={analyses}
                        className={isSelected ? "bg-brand-50 dark:bg-brand-900/20" : ""}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="radio"
                            id={inputId}
                            name="custom-analyses"
                            checked={isSelected}
                            onChange={() => setCustomAnalyses(analyses)}
                            className="accent-[var(--ink-blue)]"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <label htmlFor={inputId} className="block cursor-pointer text-[var(--text-primary)]">
                            {analyses}
                          </label>
                        </td>
                        <td className={`${FONT_MONO} text-right py-2 px-3`}>
                          <label htmlFor={inputId} className="block cursor-pointer text-[var(--text-primary)]">
                            {price.toLocaleString()} UZS
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4 mt-5 flex-wrap">
              <p className="text-xs text-[var(--text-secondary)]">
                {customAnalyses} analyses · {customPerAnalysisText(customPrice, customAnalyses)} UZS per analysis
              </p>
              <Button
                onClick={openCustomPayment}
                variant="secondary"
                className={`shrink-0 ${ownCustom === customAnalyses ? "opacity-60" : ""}`}
                disabled={ownCustom === customAnalyses}
              >
                {ownCustom === customAnalyses ? "Current plan" : `Get Customizable (${customPrice.toLocaleString()} UZS) →`}
              </Button>
            </div>
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

      {/* Payment receipt */}
      {paymentTarget && receipt && (
        <div
          onClick={() => setPaymentTarget(null)}
          className="fixed inset-0 z-[1000] overflow-y-auto bg-black/60 backdrop-blur-sm"
          style={{ overscrollBehavior: "contain" }}
        >
          <div className="flex min-h-full items-center justify-center px-4 py-8 sm:px-6">
            <div
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby={modalTitleId}
              ref={modalRef}
              tabIndex={-1}
              className="w-full max-w-[440px] outline-none drop-shadow-[0_8px_32px_rgba(15,23,42,0.14)] dark:drop-shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            >
              <div className="receipt-print">
                <section className="receipt-top rounded-t-[18px] bg-[var(--bg-card)] px-6 pt-4 pb-7 sm:px-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src="/logo.png" alt="" className="size-6 rounded-md" />
                      <span className="text-sm font-bold text-[var(--text-primary)]">WriteReady IELTS</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentTarget(null)}
                      className="-mr-2.5 flex size-10 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] dark:hover:bg-[var(--bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      aria-label="Close"
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>

                  <h2
                    id={modalTitleId}
                    className="mt-4 text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                  >
                    Order summary
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    <time dateTime={new Date().toISOString().slice(0, 10)}>
                      {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                    {" · "}Paid by card transfer
                  </p>

                  <div className="mt-6 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-medium text-[var(--text-primary)]">{receipt.item}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{receipt.detail}</p>
                    </div>
                    <p className={`${FONT_MONO} shrink-0 text-base tabular-nums text-[var(--text-primary)]`}>
                      {uzsFigure(receipt.amount)}
                    </p>
                  </div>

                  <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-t border-dashed border-[var(--border-strong)] pt-4 text-sm">
                    <dt className="text-[var(--text-secondary)]">Billing</dt>
                    <dd className="text-right text-[var(--text-primary)]">{receipt.billing}</dd>
                    <dt className="text-[var(--text-secondary)]">Account</dt>
                    <dd className="truncate text-right text-[var(--text-primary)]">
                      {user?.email ?? (
                        <Link
                          to="/auth?mode=signup"
                          className="font-medium text-[var(--ink-blue)] underline-offset-4 hover:underline"
                        >
                          Sign up first
                        </Link>
                      )}
                    </dd>
                  </dl>

                  <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-dashed border-[var(--border-strong)] pt-4">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Total due</span>
                    <span className={`${FONT_MONO} text-[1.875rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]`}>
                      {uzsFigure(receipt.amount)}
                      <span className="ml-1.5 text-sm font-medium text-[var(--text-secondary)]">UZS</span>
                    </span>
                  </div>
                </section>

                <section
                  aria-label="How to pay"
                  className="receipt-stub relative rounded-b-[18px] bg-[var(--bg-card)] px-6 pt-7 pb-6 sm:px-8"
                >
                  <div aria-hidden="true" className="absolute inset-x-5 top-0 border-t-2 border-dashed border-[var(--border-color)]" />

                  <h3 className="text-base font-semibold text-[var(--text-primary)]">How to pay</h3>

                  <ol className="mt-4 space-y-5">
                    <li className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={`${FONT_MONO} flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-xs text-[var(--text-secondary)]`}
                      >
                        1
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-[var(--text-primary)]">
                          Transfer{" "}
                          <span className={`${FONT_MONO} font-medium tabular-nums`}>{uzsFigure(receipt.amount)} UZS</span>{" "}
                          to this card
                        </p>
                        <div className="mt-2.5 rounded-[10px] bg-[var(--bg-subtle)] px-4 py-3 dark:bg-[var(--bg-base)]">
                          <p className={`${FONT_MONO} whitespace-nowrap text-lg font-medium tabular-nums tracking-[0.02em] text-[var(--text-primary)]`}>
                            {CARD_NUMBER}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-xs text-[var(--text-secondary)]">
                              Cardholder: <span className="font-medium text-[var(--text-primary)]">{CARDHOLDER}</span>
                            </p>
                            <button
                              type="button"
                              onClick={handleCopyCard}
                              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--border-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            >
                              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                              {copied ? "Copied" : "Copy number"}
                            </button>
                          </div>
                          <span className="sr-only" aria-live="polite">{copied ? "Card number copied" : ""}</span>
                        </div>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={`${FONT_MONO} flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-xs text-[var(--text-secondary)]`}
                      >
                        2
                      </span>
                      <p className="min-w-0 flex-1 text-sm leading-6 text-[var(--text-secondary)]">
                        Send the transfer receipt to{" "}
                        <span className="font-semibold text-[var(--text-primary)]">@{TELEGRAM_USERNAME}</span>{" "}
                        on Telegram, with the email you signed up with.
                      </p>
                    </li>
                  </ol>

                  <a
                    href={`https://t.me/${TELEGRAM_USERNAME}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[var(--ink-blue-solid)] text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
                  >
                    <Send size={16} aria-hidden="true" />
                    Open Telegram
                  </a>
                  <p className="mt-3 text-center text-xs text-[var(--text-secondary)]">
                    {receipt.done} within 24 hours of your message.
                  </p>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
