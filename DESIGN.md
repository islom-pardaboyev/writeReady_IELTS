---
name: WriteReady IELTS
description: IELTS Writing practice with instant AI feedback, and the staff panels that run it, in one light-and-dark world of paper, hairlines and indigo ink.
colors:
  ink-blue: "#4f46e5"
  ink-blue-dark: "#818cf8"
  primary-foreground: "#ffffff"
  primary-foreground-dark: "#0f172a"
  accent: "#eef2ff"
  accent-dark: "#312e81"
  accent-foreground: "#4f46e5"
  accent-foreground-dark: "#e0e7ff"
  gold: "#f59e0b"
  bg-base: "#f8f9fa"
  bg-base-dark: "#0f172a"
  bg-card: "#ffffff"
  bg-card-dark: "#1e293b"
  bg-subtle: "#f1f5f9"
  bg-subtle-dark-staff: "#273449"
  text-primary: "#0f172a"
  text-primary-dark: "#f1f5f9"
  text-secondary: "#475569"
  text-secondary-dark: "#94a3b8"
  border-color: "#e2e8f0"
  border-color-dark: "#334155"
  border-strong: "#cbd5e1"
  border-strong-dark: "#475569"
  success-tint: "oklch(97.9% 0.021 166.113)"
  success-soft: "oklch(95% 0.052 163.051)"
  success-ink: "oklch(50.8% 0.118 165.612)"
  warning-tint: "oklch(98.7% 0.022 95.277)"
  warning-soft: "oklch(96.2% 0.059 95.617)"
  warning-ink: "oklch(55.5% 0.163 48.998)"
  danger-tint: "oklch(97.1% 0.013 17.38)"
  danger-soft: "oklch(93.6% 0.032 17.717)"
  danger-ink: "oklch(50.5% 0.213 27.518)"
  danger-action: "oklch(57.7% 0.245 27.325)"
  coral: "#ef4444"
  coral-dark: "#f87171"
  info-soft: "oklch(93% 0.034 272.788)"
  info-ink: "oklch(45.7% 0.24 277.023)"
  purple-soft: "oklch(94.6% 0.033 307.174)"
  purple-ink: "oklch(49.6% 0.265 301.924)"
  accent-ocean: "#006da5"
  accent-ocean-dark: "#00a3dd"
  accent-teal: "#00776d"
  accent-teal-dark: "#00ae9c"
  accent-violet: "#7239d8"
  accent-violet-dark: "#9b82e7"
  accent-berry: "#ba0060"
  accent-berry-dark: "#eb55a8"
  accent-graphite: "#1d293d"
  accent-graphite-dark: "#d4d4d4"
  exam-ink: "#262626"
  exam-ink-dark: "#525252"
  exam-text: "#000000"
  exam-text-dark: "#ffffff"
  exam-hover: "#404040"
  exam-page-dark: "#171717"
  exam-deep: "#0a0a0a"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  title-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.429
    letterSpacing: "normal"
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.429
    letterSpacing: "normal"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
    letterSpacing: "normal"
  label-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "normal"
  caption-strong:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "normal"
  figure:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    fontFeature: "tnum"
  answer:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  answer-serif:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  answer-exam:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  base: "4px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  full: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink-blue}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-primary-dark:
    backgroundColor: "{colors.ink-blue-dark}"
    textColor: "{colors.primary-foreground-dark}"
  button-outline:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.bg-subtle}"
  button-secondary:
    backgroundColor: "{colors.bg-subtle}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.bg-subtle}"
  button-danger-outline:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.danger-action}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-danger-outline-hover:
    backgroundColor: "{colors.danger-tint}"
  button-destructive:
    backgroundColor: "{colors.danger-action}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "40px"
  button-sm:
    typography: "{typography.caption-strong}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  input-search:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 36px"
    height: "36px"
  chip-filter:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "28px"
  chip-filter-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  badge-plan-free:
    backgroundColor: "{colors.bg-subtle}"
    textColor: "{colors.text-primary}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-plan-paid:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info-ink}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-plan-premium:
    backgroundColor: "{colors.purple-soft}"
    textColor: "{colors.purple-ink}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-ink}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-ink}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-ink}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  nav-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-blue}"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  list-row-hover:
    backgroundColor: "{colors.bg-subtle}"
  list-row-selected:
    backgroundColor: "{colors.accent}"
  list-pane:
    backgroundColor: "{colors.bg-card}"
    width: "340px"
  panel:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.xl}"
    padding: "16px 20px 20px"
  stat-tile:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.figure}"
    padding: "16px 20px"
  login-card:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.xl}"
    padding: "24px"
    width: "380px"
  dialog:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.2xl}"
    padding: "24px"
    width: "512px"
  switch-on:
    backgroundColor: "{colors.ink-blue}"
    rounded: "{rounded.full}"
    width: "44px"
    height: "24px"
  switch-off:
    backgroundColor: "{colors.border-strong}"
    rounded: "{rounded.full}"
    width: "44px"
    height: "24px"
  staff-sidebar:
    backgroundColor: "{colors.bg-card}"
    width: "220px"
  segmented-control:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.lg}"
    padding: "4px"
    height: "46px"
  segmented-control-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
  accent-swatch:
    rounded: "{rounded.full}"
    width: "36px"
    height: "36px"
  text-settings-popover:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.xl}"
    padding: "16px"
    width: "320px"
---

# Design System: WriteReady IELTS

## Overview

**Creative North Star: "Ink on Paper"**

WriteReady looks like a well-kept workbook: a pale paper ground, white sheets separated by hairlines, and one indigo ink used for the mark that matters. The token names already say it (`--paper`, `--ink-blue`), and the rest of the system follows. Quiet slate neutrals carry almost everything; indigo marks the primary action, the current selection and keyboard focus; emerald, amber and red appear only when something has a state to report.

One world serves two kinds of visitor. Students get the fuller expression of it: heavier headings, cards with a soft shadow that lift on hover, entrance motion on the dashboard and landing page. Staff (the owner, learning centers, teachers) get the same materials tuned for operating: a light grouped sidebar, a searchable record list with the selected record open beside it, semibold headings, flat hairline panels, and IBM Plex Mono for every figure. PRODUCT.md makes this binding: the staff panels use the same colors and design language as the student pages.

Density is comfortable rather than compact: 14px body text, 40px controls, 16 to 24px gaps. Light and dark themes both come from the same semantic tokens, switched by a `.dark` class on `<html>` (light, dark or system, chosen in the theme menu).

**Key Characteristics:**
- Pale paper ground, white panels, 1px slate hairlines.
- A single indigo ink for primary action, selection and focus.
- Emerald, amber and red only for state.
- Inter for words, IBM Plex Mono for numbers.
- One radius family: 8px fields, 10px controls, 14px panels, pills for chips and badges.
- Lucide line icons at 16px in controls and 18px in navigation.
- Full light and dark themes from tokens.

## Colors

Slate neutrals with one indigo ink; every other hue has a specific job.

Token values live in `src/index.css` (`:root` for light, `.dark` for dark). The hex tokens above are the project's own custom properties; the `oklch()` state values are Tailwind v4 palette steps used directly in class names, recorded in Tailwind's own format.

### Primary
- **Ink Blue** (`ink-blue`, dark `ink-blue-dark`): the one voice. Primary buttons, the switch's on state, text links, the active nav item's text, shortcut icons on the admin home, the text caret, and the focus ring (`--ring` is the same color). In dark mode it lightens to periwinkle and primary-button text flips to `primary-foreground-dark` for contrast.
- **Ink Wash** (`accent`, dark `accent-dark`) with **Ink Wash Text** (`accent-foreground`, dark `accent-foreground-dark`): the selection tint. Active sidebar item, selected list row, active filter chip, initials avatars. It is diluted ink, so it reads as "chosen" without competing with the primary button.

### Accent colors (student side)
A student can swap the indigo ink for one of five other inks on My Account (Appearance card). Indigo stays the brand and the default; staff portals always use it, whatever the browser has saved.
- **The inks:** Ocean (`accent-ocean`), Teal (`accent-teal`), Violet (`accent-violet`), Berry (`accent-berry`) and Graphite (`accent-graphite`), each with a lighter `-dark` ink for dark mode. The hues stay clear of emerald, amber and red, so an accent never looks like a state.
- **How it is built:** the choice sets `<html data-accent="…">` (indigo sets nothing). Each accent is one 50 to 950 scale, `--acc-*` in `src/index.css`, and every step has the same lightness as the indigo step it replaces, so contrast never drops below indigo's: white on the ink and the ink on white are 5.4:1 or better, and the dark-mode ink on the dark card is 5.4:1 or better. The ink, wash, ring, chart and sidebar tokens all derive from that scale.
- **Graphite** is ink without a hue: near-black in light mode and near-white in dark mode, with a wash one step deeper than the hover grey. Its greys follow each theme's own neutrals (slate in light, plain grey in dark).
- **Tailwind names:** brand ink written as a Tailwind color uses `brand-*` (defaults to indigo), `brand-blue-*` (the blue of Mock, Practice and Relax) or `brand-violet-*` (the violet of Quick Write). With no accent each one is exactly the Tailwind color it replaced.

### Tertiary
- **Upgrade Gold** (`gold`): student side only, for the premium upsell (the `gold` button variant, the band-score highlight on the feedback report). Staff surfaces never use it.

### Neutral
- **Paper** (`bg-base`, dark `bg-base-dark`): the page ground behind everything.
- **Sheet White** (`bg-card`, dark `bg-card-dark`): panels, the list pane, the sidebar, inputs, outline buttons, dialogs.
- **Slate Mist** (`bg-subtle`): hover fills, skeleton bars, empty-state icon wells, the Free plan badge. The shared dark theme sets it equal to `bg-card`, which hides hovers, so inside `.staff-shell` dark mode it becomes `bg-subtle-dark-staff`.
- **Ink Black** (`text-primary`, dark `text-primary-dark`): headings, body text, values.
- **Slate Gray** (`text-secondary`, dark `text-secondary-dark`): labels in stat tiles, meta lines, hints, placeholders, counts beside titles, group labels.
- **Hairline** (`border-color`, dark `border-color-dark`): every border and divider.
- **Firm Hairline** (`border-strong`, dark `border-strong-dark`): the switch's off track, scrollbar thumbs, the hover border on shortcut tiles.

### State
- **Emerald** (`success-tint`, `success-soft`, `success-ink`): done, open, checked, active.
- **Amber** (`warning-tint`, `warning-soft`, `warning-ink`): waiting, expiring soon, pending counts in the sidebar.
- **Red** (`danger-tint`, `danger-soft`, `danger-ink`, `danger-action`): errors, ended contracts, maintenance switched on, destructive actions. `coral` (dark `coral-dark`) is the shared `--destructive` token; staff destructive buttons use `danger-action` instead.
- The tint (the -50 step) fills notices and icon wells; the soft step (-100) fills badges; the ink (-700) is the text, one step deeper (-800) inside notices. Dark mode swaps each fill for the -950 or -900 step at 30 to 50% opacity with -300 text, always written as an explicit `dark:` pair.

### Categorical
- **Plan tiers are labels, not state.** Free uses the `secondary` badge, Basic and Standard use `info` (`info-soft` on `info-ink`), Premium and Lifetime use `purple` (`purple-soft` on `purple-ink`), the legacy Pro plan uses `outline`. The student dashboard uses the same info and purple pair to label Task 2 and Task 1 reports.

### Named Rules
**The One Ink Rule.** Solid indigo marks exactly three things: the primary action, the current selection and keyboard focus. If a screen shows two solid indigo buttons side by side, one of them should be outline.

**The State-Only Rule.** Emerald, amber and red speak only about state: done, waiting, wrong, or about to be destroyed. Plan tiers and other categories take the secondary, info, purple or outline badges instead.

**The Token Theme Rule.** Surfaces take color from the semantic tokens (`var(--bg-card)`, `var(--text-secondary)`, `var(--border-color)`), so dark mode comes for free. Raw Tailwind hues appear only as state tints, each with its `dark:` counterpart.

**The Meaning Stays Rule.** A student's accent changes the ink, never a meaning. Band-score colors, criterion and mistake categories, plan-tier badges and announcement types keep their plain Tailwind names (`blue-500`, `indigo-*`, `purple-*`), so no accent can make band 6 look like band 7 or a warning look like a button. Only brand ink (actions, selection, focus, links, highlights) is written as `brand-*`.

## Typography

**Display Font:** Inter (with sans-serif)
**Body Font:** Inter (with sans-serif)
**Label/Mono Font:** IBM Plex Mono (with monospace), for figures only

**Character:** One neutral grotesque carries every word and a mono carries every number, so counts, money, band scores and IDs line up in columns and read as data rather than prose. Both load from Google Fonts in `index.html` (Inter 300 to 700, Plex Mono 400 and 500). Because Plex Mono 600 is not loaded, every semibold figure is currently synthesized by the browser; add `600` to the Plex Mono weights in the font link to render it for real.

### Hierarchy
- **Display** (black, fluid 36 to 52px, 1.1): the landing-page hero only. Inter is loaded only up to 700, so it currently renders at 700.
- **Headline** (semibold, 24px, 32px line): staff page titles such as Overview and Settings. Student pages run heavier here: the dashboard welcome is 36px bold and section titles are 20px bold.
- **Title** (semibold, 20px, 28px line): the selected record's name at the top of the detail pane, and the staff login card title. Dialog titles sit between at 18px semibold.
- **Title Small** (semibold, 18px): the list pane title, with the record count beside it in 14px regular Slate Gray.
- **Heading** (semibold, 16px): detail-section headings. Panel titles step down to 14px semibold.
- **Body** (regular, 14px, 20px line): the default for everything operational. Long text (descriptions, announcement bodies) caps at 65ch.
- **Label** (medium, 14px): field labels, list-row titles, sidebar items, key-value values.
- **Button** (semibold, 14px): button text. Small buttons drop to 12px (Caption Strong).
- **Caption** (regular, 12px): field hints and errors, row meta lines, stat-tile hints.
- **Caption Strong** (semibold, 12px): badges and small buttons. Filter chips use the medium weight (`label-sm`).
- **Figure** (Plex Mono semibold, 24px, tabular): stat-tile values. The same face runs at 30px for a user's balance, 18px for band scores in lists, and inline for money in key-value rows.

### Named Rules
**The Mono Figures Rule.** Every count, amount, band score and ID sits in IBM Plex Mono with tabular numerals; words never do. Counts inside Inter text (chip counts, a title's record count) still take `tabular-nums`.

**The Semibold Ceiling Rule.** Staff headings stop at semibold with slightly tight tracking (-0.01 to -0.02em); bold is kept for the WriteReady wordmark. The bold, extrabold and black headings belong to the student dashboard and landing page.

### Answer text
The one place a student chooses the type: their own answer in the four writing modes (`src/lib/writingSettings.ts`). Size 14, 16, 18 or 20px (16 by default), line height 1.5, 1.7 or 2 (1.7 by default), and one of three faces: **Answer** (Inter), **Answer Serif** (Source Serif 4, loaded with the other fonts and downloaded only when used) or **Answer Exam** (Arial). Arial exists for the Mock Exam exam look and nowhere else; it is a practice tool, not a brand face.

## Layout

The spacing scale is Tailwind's 4px grid. Staff surfaces keep a steady rhythm: 2px between list rows, 6 to 10px inside toolbars, 16px between form fields, 24px between panels, 32px above each detail section.

**Staff shell.** A 220px light sidebar (64px icon rail when collapsed) beside a scrolling inset. Below 768px the sidebar becomes a 260px drawer over a 40% black scrim, opened from a sticky top bar (Sheet White at 95% with an 8px blur) that shows the logo, wordmark and role. A "Skip to content" link comes first.

**Section screens use List and Detail.** At 1024px and up: a 340px list pane with a right hairline, and a flexible detail pane; each scrolls on its own inside a full-height frame. Detail content is a centered column capped at 820px, with 16, 24 and 40px side padding at the base, 640px and 1024px steps, and 24 to 32px vertical padding. Below 1024px the detail replaces the list and gets a Back control, and the list's scroll position is restored on return. Record actions that must stay reachable sit in a sticky footer bar (Paper at 95% with an 8px blur).

**Home and settings pages.** A page heading (title, description, actions right) over content capped at 1240px. The admin home stacks a stat strip over a 12-column grid split 7 and 5 at 1024px, with 24px gaps.

**Student pages.** The landing page uses a 1160px container with 24px gutters and a two-column hero that collapses at 768px. The dashboard lays mode cards and report cards in auto-fit grids (minimum 200px tracks, 16px gaps).

**Breakpoints.** 640px (padding steps up), 768px (sidebar becomes a drawer), 1024px (list and detail sit side by side).

### Named Rules
**The Keep Your Place Rule.** Staff never leave a list to see a record. Selecting a row opens it beside the list; on narrow screens it replaces the list with a Back control that returns to the same scroll position.

## Elevation & Depth

Staff surfaces are flat: depth comes from the Paper ground, Sheet White panels and 1px hairlines, with Slate Mist for hover and inset areas. Shadows are reserved for layers that float above the page (dialogs, the skip link, the switch thumb). The student side is softly lifted: its cards pair a hairline with a small shadow and rise 2px with a medium shadow on hover, and the landing-page mockup carries a large diffuse shadow.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08)`; dark `0 1px 3px rgba(0, 0, 0, 0.3)`): student cards at rest (`--shadow-sm`).
- **Lift** (`box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1)`; dark `0 4px 16px rgba(0, 0, 0, 0.4)`): student cards on hover (`--shadow-md`).
- **Float** (`box-shadow: 0 8px 32px rgba(15, 23, 42, 0.12)`; dark `0 8px 32px rgba(0, 0, 0, 0.5)`): overlays (`--shadow-lg`; dialogs use Tailwind's `shadow-lg` at the same role).
- **Thumb** (`box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25)`): the switch knob only.

### Named Rules
**The Declared Once Rule.** A staff container in the page flow gets a hairline border or a shadow, never both. Panels, the list pane, the stat strip and the login card are border-only.

## Shapes

One radius family, derived from `--radius` (10px):
- **Base** (4px): skeleton bars, the `/` key hint, tiny icon buttons.
- **Field** (8px, `rounded-md`): inputs, selects, textareas, small buttons, image thumbnails.
- **Control** (10px, `rounded-lg`): buttons, list rows, sidebar items, notices, icon wells, shortcut tiles.
- **Panel** (14px, `rounded-xl`): panels, the stat strip, the login card, the empty-state icon well. The student `Card` reaches the same 14px through `var(--radius-lg)`.
- **Dialog** (18px, `rounded-2xl`): dialogs and student report-card skeletons.
- **Pill** (full): filter chips, badges, the switch, avatars, progress bars.

Borders are always 1px hairlines in `border-color`; the student mode cards are the one place that thickens them (1.5px). Nothing is clipped into custom silhouettes.

### Named Rules
**The One Family Rule.** New UI picks from 8, 10 and 14px or a pill, by role. Nested shapes step down: a 10px row inside a 14px panel, an 8px field inside a 14px card.

## Components

### Buttons
Solid, compact and quiet; one per screen carries the ink.
- **Shape:** gently rounded (10px); small buttons 8px.
- **Sizes:** default 40px tall with 16px sides; small 32px with 12px sides and 12px text; large 44px with 32px sides; icon 40 by 40px. Lucide icons inside are 16px with an 8px gap.
- **Primary:** Ink Blue fill, white text (dark mode: near-black text on periwinkle). Hover drops to 90% opacity. `loading` shows a spinner and disables the button.
- **Focus:** 2px Ink Blue ring with a 2px offset. **Disabled:** 60% opacity, not-allowed cursor.
- **Outline:** Sheet White with a hairline; hover fills Slate Mist. The workhorse for secondary actions (Refresh, Try again, file pickers).
- **Secondary:** Slate Mist fill with a hairline; the Cancel in confirm dialogs.
- **Ghost:** no fill, hover Slate Mist; row actions such as "Manage" with a trailing arrow.
- **Link:** Ink Blue text, underline on hover.
- **Danger Outline:** Sheet White, light red hairline, red text, pale red hover. The only way a staff screen offers a destructive action.
- **Destructive:** solid red, darker on hover; appears only as the confirm button inside the confirm dialog.
- **Gold** and **Danger** (solid coral) exist for the student upsell and legacy screens; staff UI does not use them.

### Chips
- **Style:** filter chips are 28px pills with 10px sides and 12px medium text. Unselected: hairline border, Sheet White, Slate Gray text, hover Slate Mist with Ink Black text.
- **State:** selected chips drop the border and take Ink Wash with Ink Wash Text; `aria-pressed` reflects the state. An optional count follows in tabular figures at 80% opacity. Chips are single-select filters in a labelled group.

### Badges
- **Style:** pills with 2px by 10px padding and 12px semibold text, no visible border.
- **Variants:** `success`, `warning` and `danger` for state; `secondary`, `info`, `purple` and `outline` for plan tiers and categories. Sidebar counts are a smaller amber pill (11px, tabular) at the right of the item.

### Cards / Containers
- **Panel (staff):** 14px corners, Sheet White, hairline, no shadow. Header with 20px sides, 16px top and 12px bottom: 14px semibold title, optional Slate Gray description, optional action at the right. Body has 20px sides and bottom. Rows inside divide with hairlines.
- **Stat strip:** a hairline grid. Tiles sit 1px apart on a Hairline background inside a 14px frame, wrap at a 150px minimum and stretch so no cell is ever empty. Each tile: 16 by 20px padding, 14px Slate Gray label, 24px Plex Mono figure, optional 12px hint. Clickable tiles fill Slate Mist on hover and show an inset focus ring.
- **Student card:** 14px corners, Sheet White, hairline plus the Rest shadow; padding is set per use (20 to 24px). Interactive cards rise 2px with the Lift shadow on hover.
- **Staff login card:** 380px column, logo and wordmark above, 14px corners, border only, 24px padding (28px from 640px).

### Inputs / Fields
- **Style:** 40px tall, 8px corners, hairline border, Sheet White fill, 12px sides, 14px text, Slate Gray placeholder. Textareas start at 80px and resize vertically. The password input adds a show or hide eye button at the right. Native selects share the same class.
- **Focus:** 2px ring with a 1px offset, no outline. Inside the staff shell the ring is Ink Blue; the base input components default to Tailwind blue-500 elsewhere.
- **Field wrapper:** 14px medium label above, 6px gap, 12px Slate Gray hint below. An error replaces the hint in red (`role="alert"`). Optional fields add "(optional)" in regular Slate Gray.
- **Search:** 36px tall, 16px search icon at the left, a `/` key hint at the right from 1024px. Pressing `/` anywhere outside a text field focuses it.
- **Disabled:** 50% opacity.

### Navigation
- **Staff sidebar:** light, 220px, with a 32px logo, the WriteReady wordmark (14px bold) and the role (12px Slate Gray) in a header over a hairline. Items are grouped (Content, People, Partners, Site) under 12px medium sentence-case labels, 16px apart. Each item: 18px Lucide icon and 14px medium label, 10px corners, 8 by 14px padding. Rest: Ink Black at 70%; hover: full Ink Black on Ink Wash at 60%; active: Ink Wash fill, Ink Blue text, semibold, `aria-current="page"`. Collapsed, it becomes a 64px icon rail with tooltips and hairline dividers between groups. Footer: identity (initials avatar, name, detail), the theme menu and a red ghost Sign out.
- **Student sidebar:** the same component and light variant with a flat list (Dashboard, Writing, Blog, Pricing, My Account), a notification bell and the plan badge under the name. Immersive pages such as the feedback report use a 56px blurred top bar instead.

### List and Detail (signature component)
Staff work through records, not pages.
- **List pane:** title row (18px semibold title with its count, primary action at the top right), then a toolbar (search, filter chips) with 10px gaps, a hairline, the scrolling rows and an optional footer.
- **Rows:** 8px container padding, 2px gaps. Each row is a full-width button with 10px corners and 10 by 12px padding; hover Slate Mist, selected Ink Wash with `aria-current`, focus a 2px inset Ink Blue ring.
- **Keyboard travel:** Arrow Up and Down (plus Home and End) move focus and selection together, so the detail pane follows the keyboard. Each list is one Tab stop (the selected row, else the first).
- **Detail pane:** a header (optional avatar or icon, 20px title with badges, Slate Gray meta line, actions at the right), then sections separated by a hairline, 32px above and 24px inside, each with a 16px heading, an optional 65ch description and an optional action. Facts sit in a two-column definition grid (32px column gap, 16px row gap) with 14px Slate Gray terms over 14px medium values.
- **Motion:** when the selected record changes, the detail replays a 180ms entrance: opacity from 0.4 and a 4px rise, on `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced motion removes it.

### Notices and load states
- **Notice:** 10px corners, 1px border, 10 by 14px padding, 14px text, a 16px Lucide icon (check, triangle or info). Tones: success, error, warning (state tints) and info (Slate Mist). Errors announce as alerts, the rest as status.
- **Empty state:** centered, a 44px Slate Mist icon well with 14px corners, a 14px semibold title, a Slate Gray line capped at 42ch, an optional action.
- **Load error:** the empty-state layout with a triangle icon, "Could not load ..." and an outline "Try again". A failed request never shows as an empty list.
- **Skeletons:** Slate Mist bars with 4px corners shaped like the rows they replace, pulsing unless reduced motion is set.

### Dialogs
- Sheet White, hairline, Float shadow, 18px corners, 24px padding, up to 512px wide, over a 60% black overlay with a light blur; close X at the top right. Title 18px semibold, description 14px Slate Gray.
- **Confirm dialog:** 384px wide; footer with Cancel (secondary) and the confirm button (primary, or destructive for deletions) labelled with the verb ("Delete center", "Reset to 0").

### Switch
A 44 by 24px pill: Ink Blue when on, Firm Hairline when off, a 20px white knob with the Thumb shadow sliding over 200ms (instant under reduced motion). Exposed as `role="switch"`, with the same focus ring as buttons.

### Avatars
Initials in an Ink Wash circle with Ink Wash Text, semibold at 36% of the diameter (32px in the sidebar, 36px by default); a photo replaces them when one exists.

### Maintenance page (student)
What every visitor sees while maintenance mode is on (`src/pages/MaintenancePage.tsx`); the staff portals and an admin session skip it. It speaks with the landing page's voice on Paper.
- **Frame:** the logo and "WriteReady IELTS" wordmark top left, a centered 680px column, and a footer over a hairline linking the teacher and learning center portals.
- **Headline:** landing-page black weight, fluid 36 to 60px, tight tracking, with the key words in Ink Blue. It states the reopening day in the visitor's time zone ("We reopen on 18 November.", "today", "tomorrow"), "Almost done." once the end time has passed, and "We'll be back soon." when no end is set.
- **Countdown:** one 18px-corner Sheet White card split into four cells by hairlines: days, hours, minutes and seconds in Plex Mono with tabular figures, singular or plural labels in Slate Gray. A 4px Ink Blue bar along its bottom edge shows how much of the planned closure has passed (`role="progressbar"`). Under the card, the exact reopening moment in the visitor's local time.
- **Contact:** one outline pill (44px tall) linking to the team's Telegram. No emoji, no kicker labels; the countdown updates every second but never fetches again.

### Segmented control
A single choice from two to four short options (`src/components/appearance/SegmentedControl.tsx`): a 10px-corner Sheet White track with a hairline and 4px padding, holding equal 36px segments with 8px corners and 14px medium text. The chosen segment takes Ink Wash with Ink Wash Text (the weight does not change, so nothing shifts); others are Slate Gray and fill Slate Mist on hover. Underneath it is a radio group: Tab lands on the chosen segment, the arrow keys move the choice, and focus shows as an inset 2px ring. A segment that is only a glyph carries a spoken label ("Large, 18 pixels").

### Accent swatches
Six 36px circles filled with each accent's ink (the dark-mode ink in dark mode), 10px apart on phones and 12px from 640px, so all six share one row at 375px. The chosen one shows a check in the page's primary-foreground color and a ring of its own color set off by a 2px gap of card color; the focus outline sits 6px out, beyond that ring. The chosen name sits right of the label in Slate Gray.

### Text settings popover
The "Aa" button in each writing mode's top bar, styled like the bar's other icon buttons, opens a 320px Sheet White popover (14px corners, hairline, Float shadow, 16px padding) with the same fields as the Writing card on My Account: text size, font and line spacing, plus the exam look switch in Mock Exam only. A Reset link at the top right appears only when something differs from the defaults, and puts back only what that popover shows. On phones the top bars keep one line: the main button never wraps, Mock and Quick shorten it to "Finish", and the timer drops its clock icon.

### Score test button (admin only)
"Test scores" in a writing mode's top bar, shown only to the one account chosen in Admin → Settings → Score test while it is on. It is amber (`warning` tint, border and text), like the test's "On" badge in the admin panel, so it can never pass for a student control; icon only below 640px. It opens the score test window: a 448px dialog with one hairline card per task (overall band in 24px Plex Mono, the four criteria as a definition list), the combined Writing band for a full mock, and Test again / Close.

### Exam look (Mock Exam)
A switch in the writing settings. The Mock Exam root takes `data-exam-look`: every word turns to Arial, the answer to full black (`exam-text`) or full white (`exam-text-dark`), and the brand ink to plain greys (`exam-ink` near-black in light mode, `exam-ink-dark` mid-grey in dark mode so white text still reads on it). Emerald, amber and red stay, because they still mean done, time running out and time up. Dialogs render outside the root and keep the accent.

## Do's and Don'ts

### Do:
- **Do** keep one solid Ink Blue action per screen and show selection with Ink Wash plus Ink Wash Text.
- **Do** set every count, amount, band score and ID in IBM Plex Mono with tabular numerals.
- **Do** build each staff section as List and Detail: a 340px list pane with search, filter chips and rows beside a detail column capped at 820px.
- **Do** give every data surface three states: skeleton rows while loading, an empty state when there is truly nothing, and a load error with Try again when the request failed.
- **Do** make destructive actions two steps: a Danger Outline button opens the confirm dialog, whose solid destructive button names the action ("Delete teacher").
- **Do** write each state hue as a light and `dark:` pair, and add `motion-reduce:` to every pulse, spin and transition.
- **Do** use Lucide line icons (16px in controls, 18px in navigation), `aria-hidden` when a text label is present.
- **Do** write staff copy in English, in sentence case.
- **Do** write student-side brand ink as `brand-*`, `brand-blue-*` or `brand-violet-*` so it follows the accent, and keep plain Tailwind names for anything that carries a meaning.

### Don't:
- **Don't** use emerald, amber or red for plan tiers, categories or decoration.
- **Don't** put emoji in staff chrome: navigation, headings, buttons, badges, empty states.
- **Don't** use em or en dashes in visible copy; use commas, colons or "to".
- **Don't** give a staff container in the page flow both a border and a shadow.
- **Don't** introduce a radius outside 4, 8, 10, 14 and 18px or a pill.
- **Don't** hard-code hex colors in components; dark mode only works through the tokens.
- **Don't** add uppercase, letter-spaced kicker labels above headings. The landing page and dashboard still carry some; they are not a pattern to copy.
- **Don't** add page-load choreography to staff surfaces; staff motion is the 180ms detail swap and 150 to 200ms color transitions.
