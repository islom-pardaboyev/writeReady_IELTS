import type { ReactNode } from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** What a screen reader says, when the visible label is only a glyph. */
  ariaLabel?: string;
  title?: string;
}

/**
 * A row of equal segments, one of which is chosen: a radio group underneath,
 * so Tab lands on the chosen segment and the arrow keys move the choice. The
 * chosen segment takes the Ink Wash, like a selected filter chip.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  labelledBy,
  describedBy,
  disabled,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SegmentOption<T>[];
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      orientation="horizontal"
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] p-1",
        disabled && "opacity-60",
        className,
      )}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          title={o.title}
          className={cn(
            "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-medium",
            "text-[var(--text-secondary)] transition-colors duration-150 motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
            // Dark mode's --bg-subtle is the card colour itself, so the hover
            // there is a faint white instead.
            "data-[state=unchecked]:enabled:hover:bg-[var(--bg-subtle)] data-[state=unchecked]:enabled:hover:text-[var(--text-primary)] dark:data-[state=unchecked]:enabled:hover:bg-white/[0.06]",
            "data-[state=checked]:bg-[var(--accent)] data-[state=checked]:text-[var(--accent-foreground)]",
            "disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
