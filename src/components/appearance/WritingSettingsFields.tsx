import { useId } from "react";
import {
  LINE_SPACINGS,
  TEXT_SIZES,
  WRITING_FONTS,
  updateWritingSettings,
  useWritingSettings,
  type LineSpacing,
  type TextSize,
  type WritingFont,
} from "@/lib/writingSettings";
import { SegmentedControl } from "./SegmentedControl";

// The visible "A" on each text-size segment grows with the size it stands for.
const GLYPH_PX: Record<TextSize, number> = { s: 12, m: 14, l: 16, xl: 18 };

/**
 * Text size, font and line spacing for the answer box, and the Mock Exam
 * "exam look" switch. Used by the Writing card on My Account and by the text
 * settings popover in every writing mode, so both always agree.
 */
export function WritingSettingsFields({
  showExamLook,
  examLookLocksFont = false,
}: {
  /** Show the exam look switch (My Account and Mock Exam only). */
  showExamLook: boolean;
  /**
   * On the Mock Exam screen the exam look replaces the font with Arial, so the
   * font choice is locked there while it is on, instead of silently doing nothing.
   */
  examLookLocksFont?: boolean;
}) {
  const s = useWritingSettings();
  const id = useId();
  const size = TEXT_SIZES.find((t) => t.id === s.size) ?? TEXT_SIZES[1];
  const font = WRITING_FONTS.find((f) => f.id === s.font) ?? WRITING_FONTS[0];
  const fontLocked = examLookLocksFont && s.examLook;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p id={`${id}-size`} className="text-sm font-medium text-[var(--text-primary)]">
            Text size
          </p>
          <span className="text-xs tabular-nums text-[var(--text-secondary)]">{size.px} px</span>
        </div>
        <SegmentedControl<TextSize>
          labelledBy={`${id}-size`}
          value={s.size}
          onChange={(v) => updateWritingSettings({ size: v })}
          options={TEXT_SIZES.map((t) => ({
            value: t.id,
            ariaLabel: `${t.label}, ${t.px} pixels`,
            title: `${t.label}, ${t.px} px`,
            label: (
              <span aria-hidden="true" className="leading-none" style={{ fontSize: GLYPH_PX[t.id] }}>
                A
              </span>
            ),
          }))}
        />
      </div>

      <div>
        <p id={`${id}-font`} className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
          Font
        </p>
        <SegmentedControl<WritingFont>
          labelledBy={`${id}-font`}
          describedBy={`${id}-font-hint`}
          value={s.font}
          disabled={fontLocked}
          onChange={(v) => updateWritingSettings({ font: v })}
          options={WRITING_FONTS.map((f) => ({
            value: f.id,
            label: <span style={{ fontFamily: f.family }}>{f.label}</span>,
          }))}
        />
        <p id={`${id}-font-hint`} className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
          {fontLocked ? "The exam look always uses Arial. Turn it off to use your own font." : font.hint}
        </p>
      </div>

      <div>
        <p id={`${id}-spacing`} className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
          Line spacing
        </p>
        <SegmentedControl<LineSpacing>
          labelledBy={`${id}-spacing`}
          value={s.spacing}
          onChange={(v) => updateWritingSettings({ spacing: v })}
          options={LINE_SPACINGS.map((l) => ({ value: l.id, label: l.label }))}
        />
      </div>

      {showExamLook && (
        <div className="flex items-start justify-between gap-4 border-t border-[var(--border-color)] pt-4">
          <div className="min-w-0">
            <p id={`${id}-exam`} className="text-sm font-medium text-[var(--text-primary)]">
              Exam look in Mock Exam
            </p>
            <p id={`${id}-exam-hint`} className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              Arial text on a plain black and white screen, with no accent color.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={s.examLook}
            aria-labelledby={`${id}-exam`}
            aria-describedby={`${id}-exam-hint`}
            onClick={() => updateWritingSettings({ examLook: !s.examLook })}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] ${
              s.examLook ? "bg-[var(--ink-blue)]" : "bg-[var(--border-strong)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform duration-200 motion-reduce:transition-none ${
                s.examLook ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
}
