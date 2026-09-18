# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students** preparing for IELTS Writing, mostly in Uzbekistan, practising Task 1 and Task 2 and reading AI feedback in Uzbek and English.
- **Owner/admin** (a solo developer running the product): manages writing prompts, student plans and balances, leaderboard bonuses, announcements, learning centers, teachers, the blog, and maintenance mode.
- **Learning centers** (paying partners, e.g. Camelot LC): add and remove their own students within a student limit and contract period, and follow those students' results.
- **Teachers**: review essays students send for "Human Check", upload feedback documents, and track their earnings per month.

## Product Purpose

WriteReady IELTS (writeready.uz) gives IELTS Writing learners instant AI feedback: band score estimates, sentence-level corrections, and vocabulary upgrades, in Uzbek and English, across Mock, Practice, Quick Write, and Relax modes. Paid plans raise the monthly AI allowance; Human Check adds a paid review by a real teacher. Success is students improving their band score and staying subscribed.

## Positioning

AI feedback explained in Uzbek as well as English, combined with an optional human teacher review and a learning-center channel where centers enrol their own students.

## Operating Context

- Staff panels: admin at `/admin`, learning-center portal at `/center-admin`, teacher portal at `/teacher-portal`. All staff sign in through server-verified logins (`api/staff-login.ts`).
- Staff mostly use the panels on a laptop or desktop; phones must still work.
- Staff panel copy is in **English** (confirmed 2026-09-18), replacing the earlier Uzbek/English mix. The student-facing site is English with Uzbek feedback content.
- Local development and production share one Firebase project; there is no staging environment.

## Capabilities and Constraints

- Stack: Vite + React SPA, Tailwind v4, Firebase Auth + Firestore, Vercel serverless functions in `api/`.
- Plans: Free (1 AI analysis per week), Basic (19,000 UZS), Standard (29,000 UZS), Premium (49,000 UZS), Lifetime. Students also hold a UZS balance used for Human Check.
- Human Check has a configurable price and platform fee; teachers earn the difference.
- Learning centers have a student limit, contract expiry, and payment status.
- Maintenance mode closes the student site for everyone but the admin, with a planned reopening countdown. The staff portals (`/admin`, `/teacher-portal`, `/center-admin`) stay open so teachers and centers keep working (confirmed 2026-09-18).

## Brand Commitments

- Name: WriteReady / WriteReady IELTS; logo at `public/logo.png`; domain writeready.uz.
- Binding (user, 2026-09-18): the staff panels must use the same colors and design language as the student-facing pages.

## Product Principles

1. Staff should finish routine jobs (change a plan, add a student, upload feedback) in a few clicks without hunting.
2. One product, one design language: students and staff should recognise the same WriteReady.
3. Never make destructive or money-related actions easy to trigger by accident.
4. Keep it simple enough for one developer to maintain.
