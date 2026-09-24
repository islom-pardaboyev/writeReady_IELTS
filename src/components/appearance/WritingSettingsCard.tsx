import { useEffect, useId, useRef } from "react";
import { useLocation } from "react-router";
import { Card } from "@/components/ui/Card";
import {
  answerTextStyle,
  isDefaultWriting,
  resetWritingSettings,
  useWritingSettings,
} from "@/lib/writingSettings";
import { WritingSettingsFields } from "./WritingSettingsFields";

const SAMPLE =
  "Some people believe that working from home will soon replace the office. In my view, although remote work saves " +
  "time and money, most companies will keep a shared workplace, because teams solve problems faster when they meet " +
  "in person.";

/**
 * The "Writing" card on My Account: the same text settings as the "Aa" button
 * in each writing mode, with a sample answer that changes as you choose.
 */
export function WritingSettingsCard({ className = "" }: { className?: string }) {
  const s = useWritingSettings();
  const { hash } = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    if (hash === "#writing") cardRef.current?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <Card id="writing" ref={cardRef} className={`scroll-mt-6 p-6 ${className}`}>
      <h2
        ref={titleRef}
        tabIndex={-1}
        className="mb-1 font-sans text-lg font-bold text-[var(--text-primary)] outline-none"
      >
        Writing
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
        How your answer looks while you write, in every writing mode. You can also change this from the{" "}
        <span className="whitespace-nowrap font-medium text-[var(--text-primary)]">Aa</span> button while writing.
      </p>

      <WritingSettingsFields showExamLook />

      <div className="mt-5">
        <p id={`${id}-preview`} className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
          Preview
        </p>
        <div
          role="note"
          aria-labelledby={`${id}-preview`}
          className="min-h-[9.5rem] rounded-lg border border-[var(--border-color)] bg-[var(--bg-subtle)] px-4 py-3 text-[var(--text-primary)] dark:bg-[var(--bg-base)]"
          style={answerTextStyle(s)}
        >
          {SAMPLE}
        </div>
      </div>

      {!isDefaultWriting(s) && (
        <div className="mt-4 border-t border-[var(--border-color)] pt-3">
          <button
            type="button"
            onClick={() => {
              resetWritingSettings();
              // This button disappears once everything is back to default.
              titleRef.current?.focus();
            }}
            className="rounded p-0 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
          >
            Reset to defaults
          </button>
        </div>
      )}
    </Card>
  );
}
