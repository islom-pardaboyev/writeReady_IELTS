import { effectivePlan } from "./plans";
import { hasFreeReportThisWeek, type FreeUsage } from "./weeklyFree";

// Shared by Mock, Quick, and Relax modes: an active paid plan, an
// admin-granted bonus analysis, or an unused weekly free report grants access
// to AI feedback. Practice mode intentionally requires a paid plan only (no
// free/bonus path) and keeps its own local check.
//
// A learning-center student holds their center's plan and their center's
// contract end date, so effectivePlan() covers them: full access while the
// contract runs, and the free weekly report once it ends.
export function hasAccess(data: Record<string, unknown>): boolean {
  if (effectivePlan(data) !== "free") return true;
  const bonus = typeof data.bonusAnalyses === "number" ? data.bonusAnalyses : 0;
  if (bonus > 0) return true;
  return hasFreeReportThisWeek(data.freeUsage as FreeUsage | undefined);
}
