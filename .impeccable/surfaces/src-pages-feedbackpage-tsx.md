---
version: 1
slug: "src-pages-feedbackpage-tsx"
primary_target: "src/pages/FeedbackPage.tsx"
related_targets: []
---

Scope: the AI feedback report, /feedback/:id (FeedbackPage), for Task 1, Task 2 or both from a mock. Mode: Read, with some Operate (task switch, score card, PDF, spelling check, practice).

Audience: a student who just finished an essay, often on a phone, wanting to know their band, why, and what to fix. Job: read the result, act on the fixes, then dig into the detail. Proof and content: four criterion bands with the reasons from the report, the overall band (an estimate), the three priority fixes, the band gap line, recurring patterns, then sentence notes, readability, sample answer (band 8 to 9), vocabulary with Uzbek meanings, grammar, spelling, practice. Constraints: a free report shows the bands only and every other section stays visibly locked; loading, error, free task gate, score card and PDF keep working; word counts come from the page's own count.

## Direction contract

THESIS: The report opens like an examiner's result sheet: a ruled table of the four criteria with each band and the reason behind it, the overall band set large beside it, then the three fixes as a checklist the student ticks off. It refuses the category default of a gradient score ring, four identical score cards and a row of icon tabs as the first thing read.

OWN-WORLD: Ink on Paper from DESIGN.md: white sheet on paper ground, 1px hairline rules between rows, Plex Mono for every band and count, one indigo ink for the primary action and the active tab. The report's own band colours (gold 7+, ink 6, rose below 6) only on the thin band bars. No kickers, no side stripes, no gradients, no emoji.

STORY: The student sees the question they answered, reads the sheet (bands and why), sees what to reach for next, ticks through the three fixes, then opens the section they need: their marked essay, the criteria in full, readability, the sample answer, vocabulary, grammar, spelling or practice.

FIRST VIEWPORT: Slim header with back link, title, task switch, Score card (solid) and PDF (outline). Then the sheet: question block on top, the criteria table (name, bar, band, reason) with the overall band column at the right, the "to reach the next band" line along its foot. The fix checklist starts just below on desktop.

FORM: Score sheet first, position 4 on the ordered structure list (Marked script, Report booklet, Split workbench, Score sheet first, Coach's plan, Card deck). Seed key 64658799. Signature interaction: ticking a fix strikes it through and advances the "n of 3 done" count, remembered on this device for this report.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
