---
version: 1
slug: "src-pages-writing-adminpage-tsx"
primary_target: "src/pages/writing/AdminPage.tsx"
related_targets: ["src/pages/CenterAdminPage.tsx","src/pages/TeacherPortalPage.tsx"]
---

# Staff panels

Scope: the three staff surfaces, `/admin` (src/pages/writing/AdminPage.tsx), `/center-admin` (src/pages/CenterAdminPage.tsx) and `/teacher-portal` (src/pages/TeacherPortalPage.tsx), including their login screens. Visitor mode: **Operate**.

Audience and job: the owner/admin, learning-center managers and teachers, mostly on laptops, all copy in English. Admin does every job often (prompts, users, centers and teachers, blog and announcements). The admin home must show what needs attention, today's numbers, shortcuts and recent activity.

Confirmed first-screen options (user picked all four, verbatim): "Needs attention: Unchecked Human Check reviews, centers expiring soon, expired subscriptions, maintenance status." "Today's numbers: New users today, paying users, total users, prompt counts." "Quick shortcuts: One-click entry to your most common jobs." "Recent activity: Newest sign-ups and latest student reports."

Confirmed 2026-09-18: during maintenance the staff portals stay open (only students see the maintenance page).

Constraints: keep every existing function, route, login flow and Firestore write; one visual world with the student app (its tokens, components, light and dark themes); no invented metrics.

## Direction contract

THESIS: Staff work through records, not pages. Every section is a searchable list with the selected record open beside it, so changing a plan, adding a student or uploading feedback never loses your place. Refuses the default of stacked cards and full-width tables with rows that expand inline.

OWN-WORLD: The student app's world. Light sidebar with Lucide line icons and an indigo active pill; #f8f9fa ground, white panels on #e2e8f0 hairlines; indigo #4f46e5 only for primary action, selection and focus; emerald, amber and red only for state; Inter for UI with IBM Plex Mono for counts and money; one radius family; full light and dark themes from the existing tokens; no emoji in chrome.

STORY: The admin opens Home, sees what needs attention and today's numbers, jumps into a section, filters the list, selects a record, acts in the detail pane and moves to the next record. Center managers and teachers get the same shell with only their own sections.

FIRST VIEWPORT: Home: grouped sidebar at 220px; title row with today's date; a strip of five number tiles; below it, Needs attention (7/12, actionable rows with count and a go-to link, maintenance status included) beside Shortcuts over Newest sign-ups (5/12). Section screens: a 340px list pane (search, filter chips, rows, primary action at its top right) and a flexible detail pane with the record header, its actions and grouped fields.

Signature interaction: keyboard list travel. Arrow Up/Down moves the selection and the detail pane follows instantly; "/" focuses search; on narrow screens the detail pane replaces the list with a Back control. Motion grammar: 150-200ms opacity and 4px slide when the detail pane swaps records; no page-load choreography; reduced motion respected.

FORM: List and detail side by side, position 2 of my ordered list; seed key c3b6b9e3.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Resolved

- Recent activity shows newest sign-ups and the five latest AI reports (a `limit(5)` query).
