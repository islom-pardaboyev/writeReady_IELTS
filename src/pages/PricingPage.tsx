import { useRef, useEffect, useState, useId } from "react";
import { Link } from "react-router";
import { X, Copy, Send, Check, CircleCheck } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { CUSTOM_PLAN_PRICES, PLAN_INFO, customPriceFor } from "../lib/plans";
import { formatSum, formatUZS } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CapacityScale, StudyCalendar } from "../components/pricing/StudyMonth";
import { PRESETS, presetDays, spanTitle, useStudyMonth, type CoveringPlan } from "../lib/studyMonth";

const CARD_NUMBER = "9860 1606 4046 4600";
const CARDHOLDER = "PI";
const TELEGRAM_USERNAME = "writeready_admin";
const MIN_TOPUP_UZS = 50000;

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

/** What each plan includes, word for word as the plans are sold. */
const FEATURES: Record<CoveringPlan, string[]> = {
  free: ["1 AI analysis per week (one essay)", "All 4 writing modes", "Question bank + PDF export"],
  basic: [
    "5 AI analyses / month",
    "Full band-score & sentence-level feedback",
    "Vocabulary & grammar practice",
    "Sample essay + PDF export",
    "Download your last 3 reports as PDFs from the dashboard",
  ],
  standard: ["12 AI analyses / month", "Everything in Basic"],
  premium: [
    "25 AI analyses / month (highest)",
    "Everything in Basic & Standard",
    "Download your last 10 reports as PDFs (other plans keep 3)",
    "Priority support",
  ],
};

const TAGLINE: Record<CoveringPlan, string> = {
  free: "Start practising for free",
  basic: "Try AI feedback",
  standard: "Most popular choice",
  premium: "All features, maximum analyses",
};

const PLAN_ORDER: CoveringPlan[] = ["free", "basic", "standard", "premium"];
const planOf = (id: Exclude<CoveringPlan, "free">) => PLANS.find((p) => p.id === id)!;

/** How many essays a month the student's current plan already holds (Free: one a week). */
function currentAllowance(plan: string, customAnalyses?: number): number | null {
  if (plan === "forever") return Infinity;
  if (plan === "custom") return customAnalyses ?? null;
  if (plan === "basic" || plan === "standard" || plan === "premium") return PLAN_INFO[plan].monthlyAnalyses;
  return null;
}

export function PricingPage() {
  const { user, profile } = useAuth();
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [copied, setCopied] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [customAnalyses, setCustomAnalyses] = useState(10);
  const { span, selected, setSelected, activePreset, recommendation } = useStudyMonth();
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

  // A visitor who is not signed in has no plan yet, so Free reads "Start for free".
  const currentPlan: string = user ? profile?.plan ?? "free" : "none";
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

  // A signed-in student stays in the app, with the sidebar, like the
  // dashboard; a visitor gets the public site's header and footer.
  const Frame = user ? AppShell : Layout;

  const rec = recommendation;
  const allowance = currentAllowance(currentPlan, profile?.customAnalyses);
  const lifetime = currentPlan === "forever";
  // A paid plan the student already holds that covers the marked month.
  const covered = rec.count > 0 && allowance !== null && allowance >= rec.count;
  const recLabel = rec.plan ? PLAN_INFO[rec.plan].label : "";
  const spare = rec.plan && rec.plan !== "free" ? PLAN_INFO[rec.plan].monthlyAnalyses - rec.count : 0;
  const summary =
    rec.count === 0 ? "Mark the days you'll write, or start from a pattern."
    : covered ? `Your ${PLAN_INFO[currentPlan as keyof typeof PLAN_INFO]?.label ?? "current"} plan already covers this.`
    : rec.plan === "free" ? "One essay a week at most: the Free plan covers that."
    : rec.over ? `More than any plan holds. Premium gives you ${PLAN_INFO.premium.monthlyAnalyses}, nearly one a day.`
    : spare === 0 ? `${recLabel} covers exactly that.`
    : `${recLabel} covers them, with ${spare} to spare.`;

  const planButton = (id: CoveringPlan, variant: "default" | "outline", className?: string) => {
    if (currentPlan === id) {
      return (
        <Button variant="outline" className={className} disabled>
          Your current plan
        </Button>
      );
    }
    if (id === "free") {
      return (
        <Button asChild variant="outline" className={className}>
          <Link to={user ? "/dashboard" : "/auth?mode=signup"}>{user ? "Switch to Free" : "Start for free"}</Link>
        </Button>
      );
    }
    return (
      <Button variant={variant} className={className} onClick={() => openPaymentModal(planOf(id))}>
        Get {PLAN_INFO[id].label}
      </Button>
    );
  };

  const priceLine = (id: CoveringPlan) =>
    id === "free" ? "No card needed" : (
      <>
        That&rsquo;s {perAnalysisText(id)} UZS per analysis
        {id !== "basic" && <> · <span className="whitespace-nowrap font-semibold text-[var(--ink-blue)]">save up to {savingVsBasic(id)}%</span></>}
      </>
    );

  return (
    <Frame>
      <div className="min-h-[calc(100vh-120px)] bg-[var(--bg-base)] py-10 sm:py-14">
        <div className="mx-auto max-w-[1160px] px-4 sm:px-6">
          <header className="max-w-[620px]">
            <h1 className="text-[clamp(2rem,4.2vw,2.75rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--text-primary)]">
              Plan your writing month
            </h1>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]">
              Mark the days you&rsquo;ll write an essay in the next four weeks, and see the plan that covers them.
            </p>
          </header>

          <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start lg:gap-6">
            {/* The study month */}
            <section
              aria-labelledby="study-title"
              className="rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)] sm:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="study-title" className="text-base font-semibold text-[var(--text-primary)]">Your next 4 weeks</h2>
                <p className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">{spanTitle(span)}</p>
              </div>

              <div role="group" aria-label="Writing patterns" className="mt-4 flex flex-wrap items-center gap-2">
                {PRESETS.map((preset) => {
                  const on = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected(presetDays(span, preset.weekdays))}
                      className={cn(
                        "h-8 rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]",
                        on
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="ml-auto h-8 rounded-md px-2 text-[0.8125rem] font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="mt-5">
                <StudyCalendar span={span} selected={selected} onChange={setSelected} />
              </div>
              <p className="mt-4 text-xs text-[var(--text-secondary)]">
                Tap a day to mark it. With a mouse, drag across days to mark several at once.
              </p>
              {/* On phones the plan sits below the calendar, so the count and the
                  plan it lands on stay pinned to the bottom of the screen while the
                  calendar is in view, beside the chat button rather than under it. */}
              {/* The backing runs the full width under the chat button and fades
                  to the card, so days scrolling beneath never show beside the bar.
                  No z-index: the site header, stacked higher, covers it on the way out. */}
              <div className="sticky bottom-0 -mx-4 -mb-4 mt-1 rounded-b-[18px] bg-[linear-gradient(to_bottom,transparent,var(--bg-card)_20px)] px-4 pt-5 pb-[30px] sm:-mx-6 sm:-mb-6 sm:px-6 lg:hidden">
                <a
                  href="#month-plan"
                  className="mr-14 flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-3.5 py-2 text-sm text-[var(--text-primary)] no-underline shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono font-semibold tabular-nums">{rec.count}</span> {rec.count === 1 ? "essay" : "essays"}
                    {rec.plan ? <>: <span className="font-semibold">{recLabel}</span></> : ": mark a day"}
                  </span>
                  {rec.plan && <span className="shrink-0 text-xs font-medium text-[var(--ink-blue)]">See the plan</span>}
                </a>
              </div>
            </section>

            {/* What covers it */}
            <aside id="month-plan" aria-label="The plan for your month" className="scroll-mt-20 lg:sticky lg:top-6">
              <div className="rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
                <div className="p-5 sm:p-6">
                  <p aria-live="polite" className="m-0">
                    <span className="font-mono text-[2.75rem] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[var(--text-primary)]">
                      {rec.count}
                    </span>
                    <span className="ml-2 text-sm font-medium text-[var(--text-secondary)]">
                      {rec.count === 1 ? "essay" : "essays"} in 4 weeks
                    </span>
                    <span className="mt-2 block text-sm text-[var(--text-primary)]">{summary}</span>
                  </p>
                  <div className="mt-5">
                    <CapacityScale plan={rec.plan} over={rec.over} />
                  </div>
                </div>

                <div className="border-t border-[var(--border-color)]">
                  {rec.plan ? (
                    <div key={rec.plan} className="plan-sheet-in p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{recLabel}</h3>
                          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{TAGLINE[rec.plan]}</p>
                        </div>
                        <p className="shrink-0 text-right">
                          {rec.plan === "free" ? (
                            <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">Free</span>
                          ) : (
                            <>
                              <span className="font-mono text-[1.75rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                                {formatSum(PLAN_INFO[rec.plan].monthlyPriceUZS)}
                              </span>
                              <span className="mt-1 block text-xs text-[var(--text-secondary)]">UZS / month</span>
                            </>
                          )}
                        </p>
                      </div>
                      <p className="mt-3 text-xs text-[var(--text-secondary)]">{priceLine(rec.plan)}</p>

                      <ul className="mt-4 flex flex-col gap-2 text-sm">
                        {FEATURES[rec.plan].map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-[var(--text-primary)]">
                            <Check className="mt-0.5 size-4 shrink-0 text-[var(--ink-blue)]" aria-hidden="true" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-6">
                        {lifetime ? (
                          <p className="m-0 flex items-center gap-2 rounded-[10px] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
                            <CircleCheck className="size-4 shrink-0 text-[var(--ink-blue)]" aria-hidden="true" />
                            You&rsquo;re on Lifetime: every month is covered.
                          </p>
                        ) : (
                          planButton(rec.plan, "default", "h-11 w-full")
                        )}
                      </div>

                      {rec.exact && !lifetime && ownCustom !== rec.exact.analyses && (
                        <button
                          type="button"
                          onClick={() => setPaymentTarget({ kind: "custom", analyses: rec.exact!.analyses, price: rec.exact!.price })}
                          className="mt-3 w-full rounded-md text-center text-xs text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          Or exactly {rec.exact.analyses} analyses for {formatUZS(rec.exact.price)} a month (Customizable)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-5 text-sm text-[var(--text-secondary)] sm:p-6">
                      The plan that fits appears here once you mark a day.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* Every plan */}
          <section aria-labelledby="all-plans" className="mt-16">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="all-plans" className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Every plan</h2>
              <p className="text-sm text-[var(--text-secondary)]">Paid monthly by card transfer. Cancel anytime.</p>
            </div>

            <ul className="mt-5 overflow-hidden rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
              {PLAN_ORDER.map((id) => {
                const fits = rec.plan === id;
                return (
                  <li
                    key={id}
                    className={cn(
                      "grid gap-4 border-b border-[var(--border-color)] p-5 transition-colors sm:p-6 md:grid-cols-[200px_minmax(0,1fr)_230px] md:items-center md:gap-8",
                      fits && "bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]",
                    )}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">{PLAN_INFO[id].label}</h3>
                        {fits && (
                          <span className="rounded-full bg-[var(--ink-blue)] px-2.5 py-0.5 text-xs font-semibold text-white dark:text-[var(--primary-foreground)]">
                            Fits your month
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{TAGLINE[id]}</p>
                    </div>

                    <ul className="grid gap-x-6 gap-y-1.5 text-sm text-[var(--text-primary)] lg:grid-cols-2">
                      {FEATURES[id].map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap items-center justify-between gap-3 md:flex-col md:items-end md:justify-center md:text-right">
                      <div>
                        <p className="m-0">
                          {id === "free" ? (
                            <span className="text-xl font-semibold text-[var(--text-primary)]">Free</span>
                          ) : (
                            <>
                              <span className="font-mono text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                                {formatSum(PLAN_INFO[id].monthlyPriceUZS)}
                              </span>
                              <span className="ml-1.5 text-xs text-[var(--text-secondary)]">UZS / month</span>
                            </>
                          )}
                        </p>
                        <p className="m-0 mt-1 text-xs text-[var(--text-secondary)]">{priceLine(id)}</p>
                      </div>
                      {!lifetime && planButton(id, "outline", "h-9 bg-transparent")}
                    </div>
                  </li>
                );
              })}

              {/* Customizable */}
              <li className="grid gap-4 p-5 sm:p-6 md:grid-cols-[200px_minmax(0,1fr)_230px] md:items-center md:gap-8">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Customizable</h3>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    {ownCustom ? `You're on ${ownCustom} analyses a month.` : "Pick the exact number you need."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label htmlFor="custom-analyses" className="text-[var(--text-primary)]">AI analyses a month</label>
                  <select
                    id="custom-analyses"
                    name="custom-analyses"
                    value={customAnalyses}
                    onChange={(e) => setCustomAnalyses(Number(e.target.value))}
                    className="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 font-mono text-sm tabular-nums text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {CUSTOM_PLAN_PRICES.map(({ analyses }) => (
                      <option key={analyses} value={analyses}>{analyses}</option>
                    ))}
                  </select>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {customPerAnalysisText(customPrice, customAnalyses)} UZS per analysis
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 md:flex-col md:items-end md:justify-center md:text-right">
                  <p className="m-0">
                    <span className="font-mono text-xl font-semibold tabular-nums text-[var(--text-primary)]">{formatSum(customPrice)}</span>
                    <span className="ml-1.5 text-xs text-[var(--text-secondary)]">UZS / month</span>
                  </p>
                  {!lifetime && (
                    ownCustom === customAnalyses ? (
                      <Button variant="outline" className="h-9" disabled>Your current plan</Button>
                    ) : (
                      <Button variant="outline" className="h-9" onClick={openCustomPayment}>Get Customizable</Button>
                    )
                  )}
                </div>
              </li>
            </ul>
            <p className="mt-4 max-w-[72ch] text-xs leading-relaxed text-[var(--text-secondary)]">
              The price per analysis is the monthly price divided by the analyses in the plan; you still pay monthly.
              Savings compare with Basic and assume you use all of the month&rsquo;s analyses.
            </p>
          </section>

          {/* Balance */}
          {user && (
            <section
              aria-labelledby="balance-title"
              className="mt-12 grid gap-5 rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-end md:gap-10"
            >
              <div>
                <h2 id="balance-title" className="text-lg font-bold text-[var(--text-primary)]">Account balance</h2>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Used for pay-per-use features like Human Check.</p>
                <p className="m-0 mt-4 font-mono text-[1.875rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                  {formatSum(balance)}
                  <span className="ml-1.5 font-sans text-sm font-medium text-[var(--text-secondary)]">UZS</span>
                </p>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); openBalanceTopUp(); }}
                className="min-w-0"
              >
                <label htmlFor="top-up-amount" className="text-sm font-medium text-[var(--text-primary)]">Top up</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="top-up-amount"
                    autoComplete="off"
                    name="top-up-amount"
                    type="number"
                    inputMode="numeric"
                    min={MIN_TOPUP_UZS}
                    step="1000"
                    aria-describedby="top-up-hint"
                    aria-invalid={topUpTooLow}
                    placeholder={`e.g. ${formatSum(100000)}…`}
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className={cn(
                      "h-10 min-w-0 flex-1 rounded-md border bg-[var(--bg-card)] px-3 font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:font-sans placeholder:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      topUpTooLow ? "border-red-400 dark:border-red-500" : "border-[var(--border-color)]",
                    )}
                  />
                  <Button type="submit" variant="outline" disabled={!topUpAmount || topUpValue < MIN_TOPUP_UZS}>
                    Top up
                  </Button>
                </div>
                <p id="top-up-hint" className={cn("mt-1.5 text-xs", topUpTooLow ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]")}>
                  The minimum is {formatUZS(MIN_TOPUP_UZS)}.
                </p>
              </form>
            </section>
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
                      <img src="/logo.png" alt="" width={24} height={24} className="size-6 rounded-md" />
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
                    <p className={`font-mono shrink-0 text-base tabular-nums text-[var(--text-primary)]`}>
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
                    <span className={`font-mono text-[1.875rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]`}>
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
                        className={`font-mono flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-xs text-[var(--text-secondary)]`}
                      >
                        1
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-[var(--text-primary)]">
                          Transfer{" "}
                          <span className={`font-mono font-medium tabular-nums`}>{uzsFigure(receipt.amount)} UZS</span>{" "}
                          to this card
                        </p>
                        <div className="mt-2.5 rounded-[10px] bg-[var(--bg-subtle)] px-4 py-3 dark:bg-[var(--bg-base)]">
                          <p className={`font-mono whitespace-nowrap text-lg font-medium tabular-nums tracking-[0.02em] text-[var(--text-primary)]`}>
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
                        className={`font-mono flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-xs text-[var(--text-secondary)]`}
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
    </Frame>
  );
}
