# WriteReady IELTS

AI feedback for IELTS Writing, in Uzbek and English. Live at [writeready.uz](https://www.writeready.uz).

Students write Task 1 and Task 2 answers in four modes (Mock exam, Practice, Quick Write, Relax) and get a band score for each IELTS criterion, sentence-by-sentence corrections, vocabulary with Uzbek meanings, grammar points and a model answer. A student can also send an essay to a real teacher (Human Check). Learning centers enrol their own students through a center portal.

## Stack

- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS v4, installable as a PWA
- **Backend:** Vercel serverless functions in `api/`
- **Data and sign-in:** Firebase Auth and Firestore
- **AI:** Claude Sonnet 5 for essay reports, Claude Haiku 4.5 for practice checks and the help chat

## How an essay is scored

1. `api/pre-check.ts` checks the student's plan and takes one report from their allowance (monthly plan, bonus, or the free weekly report). It returns a signed token that is valid for 3 minutes and can be used once.
2. `api/feedback.ts` spends the token, sends the essay to Claude and streams the report back. For Task 1 it also sends the chart, so the student's figures are checked against it.
3. The prompt contains the official IELTS Writing band descriptors (public version, May 2023, kept in `scripts/ielts-official-band-descriptors.md`) and the examiners' best-fit method. It also covers the cases a naive marker gets wrong: essays that don't answer the question, essays far under the word count, essays not in English, and essays that try to instruct the AI.
4. The overall band is always worked out in code with the official IELTS rounding (`api/_lib/bandScore.ts`), never taken from the model's own sum. The browser, the database and every chart use this same file.
5. A report that fails or comes back without real scores is refunded automatically and never saved.

The free weekly report uses exactly the same scoring rules as a paid report. It only leaves out the extra sections.

## Project layout

```
api/                  Vercel functions (one file = one endpoint)
  _lib/               Shared server code. bandScore.ts has no imports, so the site uses it too (@shared/...)
src/
  pages/              Routes: landing, dashboard, feedback, writing modes, staff portals
  pages/writing/admin Admin panel sections
  components/         UI, layout and staff-portal components
  firebase/           Firestore and Auth helpers
  lib/                Plans, PDFs, charts, shortcuts and other logic
scripts/              Scoring test script, reference essays, image build scripts
firestore.rules       Security rules (the live copy is in the Firebase console)
```

## Running locally

```bash
npm install
```

```bash
vercel dev
```

`vercel dev` serves the site and the `api/` functions on http://localhost:3000. `npm run dev` serves the site only, without the API.

> Local development uses the **same Firebase project as production**. Anything you save locally changes the live site.

## Environment variables

Set in Vercel (Production and Preview) and in a local `.env` file, which is never committed.

| Name | Used by |
| --- | --- |
| `VITE_FIREBASE_*` | Firebase web config (public by design) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK in `api/` |
| `ANTHROPIC_API_KEY` | Essay reports, practice checks and the help chat |
| `NONCE_SECRET` | Signs report tokens. Required: the API refuses to run without it |
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | Admin panel sign-in |
| `TELEGRAM_TOKEN`, `CHAT_ID`, `TELEGRAM_TEACHERS_CHAT_ID` | Bug reports and teacher notifications |

Never put a secret in a `VITE_` variable: those are built into the public JavaScript.

## Scripts

```bash
npm run build   # type-check (strict) and build
npm run lint    # oxlint
```

`scripts/compare-band-scores.ts` grades the reference essays in `scripts/test-essays.ts` with the live prompt. **It calls the Claude API and costs money**, so run it only on purpose. Use `--dry` to see the cost first.

## Security notes

- Staff (admin, centers, teachers) sign in through `api/staff-login.ts`, which checks passwords on the server and slows down repeated wrong guesses.
- Teacher logins are kept in `teacherAuth`, a collection no browser can read.
- Changing or removing a center's student goes through `api/center-student.ts`, which updates the real sign-in account.
- Each report token works once, so one paid credit buys exactly one report.
