import { useId, useRef } from "react";
import { Popover } from "radix-ui";
import { ALargeSmall } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_WRITING, updateWritingSettings, useWritingSettings } from "@/lib/writingSettings";
import { WritingSettingsFields } from "./WritingSettingsFields";

/**
 * The "Aa" button in a writing mode's top bar. It opens the text settings
 * beside the essay, so a student can change them without leaving their work.
 * Pass the same `className` as the bar's other icon buttons.
 */
export function WritingSettingsButton({
  className,
  examLookSetting = false,
}: {
  className?: string;
  /** Mock Exam only: include the exam look switch. */
  examLookSetting?: boolean;
}) {
  const s = useWritingSettings();
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset puts back only what this popover shows, so resetting in Practice
  // never switches off the exam look a student chose for Mock Exam.
  const changed =
    s.size !== DEFAULT_WRITING.size ||
    s.font !== DEFAULT_WRITING.font ||
    s.spacing !== DEFAULT_WRITING.spacing ||
    (examLookSetting && s.examLook !== DEFAULT_WRITING.examLook);
  const reset = () => {
    updateWritingSettings({
      size: DEFAULT_WRITING.size,
      font: DEFAULT_WRITING.font,
      spacing: DEFAULT_WRITING.spacing,
      ...(examLookSetting ? { examLook: DEFAULT_WRITING.examLook } : {}),
    });
    // The Reset button disappears once there is nothing to reset; keep focus
    // inside the popover instead of dropping it on the page.
    contentRef.current?.focus();
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Text settings"
          title="Text settings"
          className={cn(
            className,
            "data-[state=open]:border-[var(--border-strong)] data-[state=open]:text-[var(--text-primary)]",
          )}
        >
          <ALargeSmall size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={titleId}
          className="z-[300] w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-lg)] outline-none"
        >
          <div className="mb-4 flex min-h-5 items-center justify-between gap-3">
            <h2 id={titleId} className="text-sm font-semibold text-[var(--text-primary)]">
              Text settings
            </h2>
            {changed && (
              <button
                type="button"
                onClick={reset}
                className="rounded text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <WritingSettingsFields showExamLook={examLookSetting} examLookLocksFont={examLookSetting} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
