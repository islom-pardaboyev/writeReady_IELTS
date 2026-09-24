import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useLocation } from "react-router";
import { RadioGroup } from "radix-ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/contexts/themeContextDef";
import { ACCENTS, setAccent, useAccent, type AccentId } from "@/lib/appearance";
import { SegmentedControl } from "./SegmentedControl";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * The "Appearance" card on My Account: light or dark, and the accent colour.
 * Both apply at once, so the page itself is the preview.
 */
export function AppearanceSettings({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const accent = useAccent();
  const { hash } = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];

  useEffect(() => {
    if (hash === "#appearance") cardRef.current?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <Card id="appearance" ref={cardRef} className={`scroll-mt-6 p-6 ${className}`}>
      <h2 className="mb-1 font-sans text-lg font-bold text-[var(--text-primary)]">Appearance</h2>
      <p className="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
        Saved on this device. Band scores, warnings and errors keep their own colors, so they always mean the same
        thing.
      </p>

      <div className="flex flex-col gap-5">
        <div>
          <p id={`${id}-theme`} className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
            Theme
          </p>
          <SegmentedControl<Theme>
            labelledBy={`${id}-theme`}
            value={theme}
            onChange={setTheme}
            options={THEMES.map(({ value, label, icon: Icon }) => ({
              value,
              label: (
                <>
                  <Icon aria-hidden="true" />
                  {label}
                </>
              ),
            }))}
          />
        </div>

        <div>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <p id={`${id}-accent`} className="text-sm font-medium text-[var(--text-primary)]">
              Accent color
            </p>
            <span className="text-sm text-[var(--text-secondary)]" aria-hidden="true">
              {current.label}
            </span>
          </div>
          <RadioGroup.Root
            value={accent}
            onValueChange={(v) => setAccent(v as AccentId)}
            aria-labelledby={`${id}-accent`}
            aria-describedby={`${id}-accent-hint`}
            orientation="horizontal"
            // 10px gaps keep all six in one row on a 375px phone.
            className="flex flex-wrap gap-2.5 px-1 py-1 sm:gap-3"
          >
            {ACCENTS.map((a) => (
              <RadioGroup.Item
                key={a.id}
                value={a.id}
                aria-label={a.label}
                title={a.label}
                style={{ "--sw": a.swatch, "--sw-dark": a.swatchDark } as CSSProperties}
                className={[
                  "grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sw)] dark:bg-[var(--sw-dark)]",
                  "transition-shadow duration-150 motion-reduce:transition-none",
                  // The chosen swatch wears a ring of its own colour, set off by
                  // a gap of card colour; the focus outline sits outside both.
                  "data-[state=checked]:shadow-[0_0_0_2px_var(--bg-card),0_0_0_4px_var(--sw)]",
                  "dark:data-[state=checked]:shadow-[0_0_0_2px_var(--bg-card),0_0_0_4px_var(--sw-dark)]",
                  "data-[state=unchecked]:hover:shadow-[0_0_0_2px_var(--bg-card),0_0_0_4px_var(--border-strong)]",
                  "focus-visible:outline-offset-[6px]",
                ].join(" ")}
              >
                <RadioGroup.Indicator className="grid place-items-center">
                  <Check aria-hidden="true" strokeWidth={3} className="size-4 text-[var(--primary-foreground)]" />
                </RadioGroup.Indicator>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <p id={`${id}-accent-hint`} className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            Colors buttons, links, tabs and highlights across your pages.
          </p>
        </div>
      </div>
    </Card>
  );
}
