import { hasFreeReportThisWeek, type FreeUsage } from "@/lib/weeklyFree";

// Shared by Mock, Quick, and Relax modes: any paid plan, a learning-center
// student, an admin-granted bonus analysis, or an unused weekly free report
// grants access to AI feedback. Practice mode intentionally requires a paid
// plan only (no free/bonus path) and keeps its own local check.
export function hasAccess(data: Record<string, unknown>): boolean {
  // Learning-center students always have access (free premium).
  if (typeof data.centerId === "string" && data.centerId.length > 0) return true;
  const plan = data.plan as string | undefined;
  if (plan === "forever" || plan === "premium" || plan === "standard" || plan === "basic") return true;
  const bonus = typeof data.bonusAnalyses === "number" ? data.bonusAnalyses : 0;
  if (bonus > 0) return true;
  return hasFreeReportThisWeek(data.freeUsage as FreeUsage | undefined);
}
