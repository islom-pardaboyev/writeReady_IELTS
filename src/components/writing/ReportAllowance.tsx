import { Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PLAN_INFO } from "@/lib/plans";
import { hasFreeReportThisWeek } from "@/lib/weeklyFree";
import { formatUZS } from "@/lib/money";

/**
 * One line in the "Get AI feedback" dialog of every writing page: what
 * pressing the button will spend, before the student presses it. Follows the
 * same rule as hasAccess() (src/lib/reportAccess.ts): a paid plan's monthly
 * reports, then admin-granted bonus reports, then the weekly free one.
 */
export function ReportAllowance() {
  const { profile } = useAuth();
  if (!profile) return null;

  const bonus = profile.bonusAnalyses ?? 0;
  const paid = profile.plan !== "free";
  const left = paid ? Math.max(0, (profile.usage?.limit ?? 0) - (profile.usage?.count ?? 0)) : 0;

  let text: string;
  let empty = false;
  if (profile.plan === "forever") {
    text = "Uses 1 report from your Lifetime plan.";
  } else if (paid && left > 0) {
    text = `Uses 1 report. You have ${left} left this month.`;
  } else if (bonus > 0) {
    text = `Uses 1 of your ${bonus} bonus ${bonus === 1 ? "report" : "reports"}.`;
  } else if (!paid && hasFreeReportThisWeek(profile.freeUsage)) {
    text = "Uses your free report for this week: your band scores.";
  } else {
    empty = true;
    text = paid
      ? "You have no reports left this month. Your essay stays saved while you look at plans."
      : `You have used this week's free report. Plans start at ${formatUZS(PLAN_INFO.basic.monthlyPriceUZS)} a month, and your essay stays saved.`;
  }

  return (
    <p
      className={`mt-4 mb-0 flex items-start justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-xs leading-5 ${
        empty
          ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          : "bg-slate-50 text-slate-600 dark:bg-neutral-800/60 dark:text-neutral-300"
      }`}
    >
      <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
