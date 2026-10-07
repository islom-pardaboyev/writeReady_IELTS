import { useMemo, useState } from "react";
import { PLAN_INFO, customPriceFor } from "@/lib/plans";

/**
 * The pricing page's study month: the next four weeks as a calendar, where
 * a student marks the days they mean to write. The count names the plan that
 * covers it (recommendPlan). Four weeks hold exactly four of each weekday,
 * so "3 a week" is 12 essays, Standard's allowance, and every plan month is
 * at least that long, so a plan that covers the four weeks covers the pace.
 * The calendar itself is src/components/pricing/StudyMonth.tsx.
 */

export const STUDY_DAYS = 28;

export type CoveringPlan = "free" | "basic" | "standard" | "premium";

export const PRESETS: { id: string; label: string; weekdays: number[] }[] = [
  { id: "1", label: "1 a week", weekdays: [5] },
  { id: "2", label: "2 a week", weekdays: [1, 4] },
  { id: "3", label: "3 a week", weekdays: [0, 2, 4] },
  { id: "weekdays", label: "Weekdays", weekdays: [0, 1, 2, 3, 4] },
  { id: "daily", label: "Every day", weekdays: [0, 1, 2, 3, 4, 5, 6] },
];

/** Monday = 0. */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;

export interface StudySpan {
  /** The 28 days from today, at local midnight. */
  days: Date[];
  /** Empty cells before today in the first row, so columns stay Mon to Sun. */
  lead: number;
}

export function studySpan(today = new Date()): StudySpan {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Array.from({ length: STUDY_DAYS }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return { days, lead: weekdayOf(start) };
}

/** The day indexes a preset marks: every day of the span on its weekdays. */
export function presetDays(span: StudySpan, weekdays: number[]): Set<number> {
  return new Set(span.days.flatMap((d, i) => (weekdays.includes(weekdayOf(d)) ? [i] : [])));
}

const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));

export interface Recommendation {
  count: number;
  /** The most essays marked in any one calendar week (Mon to Sun). */
  busiestWeek: number;
  plan: CoveringPlan | null;
  /** More than the biggest plan holds. */
  over: boolean;
  /** The Customizable plan with exactly `count` analyses, when it costs less than `plan`. */
  exact: { analyses: number; price: number } | null;
}

export function recommendPlan(span: StudySpan, selected: Set<number>): Recommendation {
  const count = selected.size;
  const perWeek = new Map<number, number>();
  for (const i of selected) {
    const row = Math.floor((span.lead + i) / 7);
    perWeek.set(row, (perWeek.get(row) ?? 0) + 1);
  }
  const busiestWeek = Math.max(0, ...perWeek.values());
  const plan: CoveringPlan | null =
    count === 0 ? null
    : busiestWeek <= 1 ? "free"
    : count <= PLAN_INFO.basic.monthlyAnalyses ? "basic"
    : count <= PLAN_INFO.standard.monthlyAnalyses ? "standard"
    : "premium";
  const over = count > PLAN_INFO.premium.monthlyAnalyses;
  const exactPrice = plan && plan !== "free" && !over ? customPriceFor(count) : 0;
  const exact = exactPrice && exactPrice < PLAN_INFO[plan as Exclude<CoveringPlan, "free">].monthlyPriceUZS
    ? { analyses: count, price: exactPrice }
    : null;
  return { count, busiestWeek, plan, over, exact };
}

/** Starts on "3 a week": twelve essays, Standard's allowance. */
export function useStudyMonth() {
  const span = useMemo(() => studySpan(), []);
  const [selected, setSelected] = useState<Set<number>>(() => presetDays(span, PRESETS[2].weekdays));
  const activePreset = PRESETS.find((p) => sameSet(presetDays(span, p.weekdays), selected))?.id ?? null;
  return { span, selected, setSelected, activePreset, recommendation: recommendPlan(span, selected) };
}

const rangeLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function spanTitle(span: StudySpan): string {
  return `${rangeLabel.format(span.days[0])} to ${rangeLabel.format(span.days[STUDY_DAYS - 1])}`;
}
