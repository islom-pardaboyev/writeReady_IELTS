---
version: 1
slug: "src-pages-landingpage-tsx"
primary_target: "src/pages/LandingPage.tsx"
related_targets: ["src/components/layout/HomeRoute.tsx"]
---

Scope: the public home page "/" (signed-out visitors; signed-in students are redirected to /dashboard). Mode: Persuade.

Audience: IELTS candidates in Uzbekistan, mostly on phones, aiming for band 6.5 to 7. Job: understand in seconds that WriteReady marks their Task 1 and Task 2 essays against the four IELTS criteria and shows where the marks went. Action: create a free account ("Check my essay"); secondary: try a mock exam, or the Telegram bot when the admin shows it.

Proof and content: the product's own Mock Exam screen; a sample marked answer (labelled as a sample); the real report contents (four criterion bands, every sentence reviewed, up to 15 better words with Uzbek meanings, up to 10 grammar points, a band 8 to 9 answer, three fixes first); modes; Human Check; learning centres; the two demo videos; home FAQ. Constraints: explanations are in English and vocabulary carries Uzbek meanings, never claim more; the band is an estimate; free = one report a week with the four band scores.

## Direction contract

THESIS: The page opens inside the IELTS computer-based test, WriteReady's own Mock Exam screen, and the answer being typed gets marked in front of the visitor. It refuses the category default of a headline beside a floating feature mockup and a row of icon cards.

OWN-WORLD: Ink on Paper from DESIGN.md: paper ground, white sheets, 1px hairlines, one indigo ink for the action. The exam frame uses the Mock Exam's own chrome: white bar, centred mono timer, dark Task pill, instruction strip, split prompt and answer panes. Red wavy underline and emerald only as marking state. IBM Plex Mono for timer, word count, bands and figures.

STORY: The visitor recognises the screen they will sit, watches an answer get marked with a sentence note, a word upgrade with its Uzbek meaning and a band, learns what the full report holds, sees the modes and the extras (Human Check, bot, centres), and signs up.

FIRST VIEWPORT: Nav on top. Headline, one short promise line, "Check my essay" (solid ink) and "Try a mock exam" (quiet), and one free-plan line (with the bot link when shown). No checklist beside it: the report section says it once. Below, spanning the container, the exam frame about 420px tall: bar with timer, Task tabs, instruction strip, prompt left, answer typing right with a word counter; when typing ends the marks and a band slip appear inside the frame. From 1280px up, the side margins carry ten drifting pieces of a marked report at different depths (grammar fix, criterion bar, ticked fix, timer chip, 7.5 band stamp, word upgrade with Uzbek, progress line, word-count chip, pen squiggle, tick), tilting with the pointer; decorative only, clear of the headline and buttons, hidden below 1280px, still under reduced motion.

FORM: Exam room, position 3 on the ordered structure list (Marked script, Report anatomy, Exam room, Before and after, Telegram thread, Proof first). Seed key 4870eec0. Signature interaction: type then mark, once, with Replay; reduced motion shows the marked state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
