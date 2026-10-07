import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { PLAN_INFO } from "@/lib/plans";
import { STUDY_DAYS, spanTitle, type CoveringPlan, type StudySpan } from "@/lib/studyMonth";

/** Weekdays, Monday first, as Uzbekistan's calendars run. */
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const monthShort = new Intl.DateTimeFormat("en-GB", { month: "short" });

/**
 * The calendar. Each day is a toggle button. A mouse or pen can press and
 * drag across days to mark (or clear) a run of them; touch taps one at a
 * time so the page still scrolls. The grid is one Tab stop: arrow keys move
 * by a day or a week, Home and End to the ends, Space or Enter toggles.
 */
export function StudyCalendar({
  span,
  selected,
  onChange,
}: {
  span: StudySpan;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ mode: "add" | "remove" } | null>(null);
  // The day a mouse press already toggled, so the click that follows it does not undo it.
  const pressed = useRef<number | null>(null);
  const latest = useRef(selected);
  latest.current = selected;

  const apply = useCallback((i: number, mode: "add" | "remove") => {
    const cur = latest.current;
    if ((mode === "add") === cur.has(i)) return;
    const next = new Set(cur);
    if (mode === "add") next.add(i);
    else next.delete(i);
    onChange(next);
  }, [onChange]);

  useEffect(() => {
    const end = () => { drag.current = null; };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const onPointerDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault(); // no text selection while painting
    const mode = latest.current.has(i) ? "remove" : "add";
    drag.current = { mode };
    pressed.current = i;
    apply(i, mode);
    setFocusIndex(i);
    buttons.current[i]?.focus({ preventScroll: true });
  };

  const onPointerEnter = (i: number) => () => {
    if (drag.current) apply(i, drag.current.mode);
  };

  const onClick = (i: number) => () => {
    // A mouse press toggled it on pointerdown already; a tap or a key toggles here.
    if (pressed.current === i) {
      pressed.current = null;
      return;
    }
    pressed.current = null;
    apply(i, latest.current.has(i) ? "remove" : "add");
    setFocusIndex(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next = focusIndex;
    if (e.key in moves) next = focusIndex + moves[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = STUDY_DAYS - 1;
    else return;
    e.preventDefault();
    next = Math.min(STUDY_DAYS - 1, Math.max(0, next));
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  const cells = span.lead + STUDY_DAYS;
  const trail = (7 - (cells % 7)) % 7;

  return (
    <div className="select-none">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1.5 pb-2 sm:gap-2">
        {WEEKDAY_SHORT.map((w) => (
          <span key={w} className="text-center text-xs font-medium text-[var(--text-secondary)]">{w}</span>
        ))}
      </div>
      <div
        role="group"
        aria-label={`Your next 4 weeks, ${spanTitle(span)}. Mark the days you will write an essay.`}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-1.5 sm:gap-2"
      >
        {Array.from({ length: span.lead }, (_, k) => <span key={`lead${k}`} aria-hidden="true" />)}
        {span.days.map((d, i) => {
          const on = selected.has(i);
          const firstOfMonth = d.getDate() === 1;
          return (
            <button
              key={i}
              ref={(el) => { buttons.current[i] = el; }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-pressed={on}
              aria-label={`${dayLabel.format(d)}${i === 0 ? ", today" : ""}`}
              onPointerDown={onPointerDown(i)}
              onPointerEnter={onPointerEnter(i)}
              onClick={onClick(i)}
              onFocus={() => setFocusIndex(i)}
              className={cn(
                "study-day group relative flex aspect-square min-h-10 flex-col items-start justify-between rounded-[10px] border p-1.5 text-left transition-colors duration-150 sm:aspect-auto sm:h-14 sm:p-2 xl:h-16",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]",
                on
                  ? "border-transparent bg-[var(--accent)]"
                  : "border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]",
                // Today carries the ink's ring, like a date circled on a paper calendar.
                i === 0 && "ring-1 ring-[var(--ink-blue)]",
              )}
            >
              <span className={cn("font-mono text-xs tabular-nums sm:text-sm", on ? "text-[var(--accent-foreground)]" : "text-[var(--text-primary)]")}>
                {d.getDate()}
                {firstOfMonth && <span className="ml-1 font-sans text-xs font-medium text-[var(--text-secondary)] max-sm:hidden">{monthShort.format(d)}</span>}
              </span>
              {i === 0 && (
                <span className="text-xs font-medium leading-none text-[var(--ink-blue)] max-sm:hidden">Today</span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "study-ink absolute right-1.5 bottom-1.5 size-2.5 rounded-full bg-[var(--ink-blue)] sm:right-2 sm:bottom-2 sm:size-3",
                  on ? "scale-100 opacity-100" : "scale-0 opacity-0",
                )}
              />
            </button>
          );
        })}
        {Array.from({ length: trail }, (_, k) => <span key={`trail${k}`} aria-hidden="true" />)}
      </div>
    </div>
  );
}

const SCALE_STEPS: { plan: CoveringPlan; label: string; figure: string }[] = [
  { plan: "free", label: "Free", figure: "1 a week" },
  { plan: "basic", label: "Basic", figure: String(PLAN_INFO.basic.monthlyAnalyses) },
  { plan: "standard", label: "Standard", figure: String(PLAN_INFO.standard.monthlyAnalyses) },
  { plan: "premium", label: "Premium", figure: String(PLAN_INFO.premium.monthlyAnalyses) },
];

/**
 * Where the count lands among the plans: four equal steps (Free, Basic,
 * Standard, Premium), each labelled with what it holds, and a marker that
 * slides to the step that covers the month. A ladder, not a number line:
 * Free and Basic hold 4 and 5, which a linear scale would draw on one spot.
 */
export function CapacityScale({ plan, over }: { plan: CoveringPlan | null; over: boolean }) {
  const index = plan ? SCALE_STEPS.findIndex((s) => s.plan === plan) : -1;
  // The middle of the covering step, in % of the track.
  const position = index < 0 ? 0 : over ? 100 : index * 25 + 12.5;
  return (
    <div aria-hidden="true">
      {/* The track is a size container, so the marker moves in cqw: a transform
          on the dot alone, with no full-width layer to widen the page. */}
      <div className="relative h-2 rounded-full bg-[var(--border-color)] [container-type:inline-size]">
        <div
          className="study-fill absolute inset-0 origin-left rounded-full bg-[var(--ink-blue)]"
          style={{ transform: `scaleX(${position / 100})` }}
        />
        <span
          className={cn(
            "study-marker absolute top-1/2 left-0 size-4 rounded-full border-[3px] border-[var(--bg-card)] bg-[var(--ink-blue)] shadow-[var(--shadow-sm)]",
            index < 0 && "opacity-0",
          )}
          style={{ transform: `translate(calc(${position}cqw - 50%), -50%)` }}
        />
      </div>
      <ol className="mt-2.5 grid grid-cols-4 text-center">
        {SCALE_STEPS.map((s, i) => (
          <li key={s.plan} className={cn("min-w-0 transition-colors", i === index ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
            <span className={cn("block truncate text-xs", i === index ? "font-semibold" : "font-medium")}>{s.label}</span>
            <span className={cn("block text-xs tabular-nums", /^\d+$/.test(s.figure) && "font-mono")}>{s.figure}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
