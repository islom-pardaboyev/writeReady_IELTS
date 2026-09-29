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
2. `api/feedback.ts` spends the token, sends the essay to Claude and streams the report back.
3. The prompt contains the official IELTS Writing band descriptors (public version, May 2023, kept in `scripts/ielts-official-band-descriptors.md`) and the examiners' best-fit method.
   For Task 1, the chart itself (image or PDF) is sent with the essay in every mode, on free and paid reports alike, so the AI checks the student's trends and figures against it. A paid report also names each mistake. If the AI cannot open the file, the essay is marked from the question alone rather than failing.
4. The overall band is always worked out in code with the official IELTS rounding (`api/_lib/bandScore.ts`), never taken from the model's own sum. The browser, the database and every chart use this same file.
5. A report that fails or comes back without real scores is refunded automatically and never saved.

The free weekly report uses exactly the same scoring rules as a paid report. It only leaves out the extra sections.

**Score test (admin only).** Admin → Settings → Score test adds a "Test scores" button to the top bar of every writing mode (and "Scores only (test)" next to Get AI feedback), for one chosen account. Use Relax mode for outside sample essays, since it is the mode where you type the question yourself. It marks the essay with the free report's prompt and shows only the band scores. It spends no report, saves nothing, and marks fresh every time, so it shows how the site grades an essay. Each run is still one paid AI call. `api/feedback.ts` (`runScoreTest`) checks the switch and the account on every request.

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
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | Admin panel sign-in. Use a long random password (20+ characters) |
| `OWNER_EMAIL` | Optional. The site owner's own account, which must also be signed in on the main site to open the admin panel. Defaults to the owner's address in `api/staff-login.ts` |
| `CRON_SECRET` | **Required in production (Production environment).** Any long random string. Vercel's scheduler sends it with every cron call, and `api/bot-daily` and the Telegram webhook setup refuse a call without it. Without it the hourly bot job stops |
| `TELEGRAM_TOKEN`, `CHAT_ID`, `TELEGRAM_TEACHERS_CHAT_ID` | Bug reports and teacher notifications |
| `TELEGRAM_STUDENT_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS` | The student Telegram bot, and who may use its `/admin` command |
| `RESEND_API_KEY`, `RESEND_FROM` | Sign-in code emails |

Never put a secret in a `VITE_` variable: those are built into the public JavaScript. The admin login and password used to be copied into `VITE_LOGIN` and `VITE_PASSWORD`, which nothing reads any more. Delete them, in Vercel and in `.env`.

## Scripts

```bash
npm run build   # type-check (strict) and build
npm run lint    # oxlint
```

`scripts/compare-band-scores.ts` grades the reference essays in `scripts/test-essays.ts` with the live prompt. **It calls the Claude API and costs money**, so run it only on purpose. Use `--dry` to see the cost first.

## Security notes

- Staff (admin, centers, teachers) sign in through `api/staff-login.ts`, which checks passwords on the server and slows down repeated wrong guesses. The admin also needs the site owner's own signed-in session on the main site, so a stolen or guessed password is not enough on its own.
- Every admin-only endpoint checks the email **and** that the token is a staff token (`isAdminToken` in `api/_lib/shared.ts`). Anyone can make an account with a staff email through Firebase's public sign-up address, but that account signs in with a `password` provider and never counts as staff.
- Teacher logins are kept in `teacherAuth`, a collection no browser can read.
- Creating, changing or removing a center's student goes through `api/center-student.ts`. It makes the sign-in account with the email already confirmed, and before it changes any account it checks that the profile belongs to the caller's center.
- **No address is trusted by its ending.** A password account must have a confirmed email to use the site or the API (`api/_lib/emailGate.ts`, and `signedIn()` in `firestore.rules`). There is no exception for `@writeready.student`: anyone can register such an address for themselves.
- Each report token works once, so one paid credit buys exactly one report. A report is refused before it is charged if it has more than 100 sentences, and only 5 refunds a day are given for reports the AI had already started writing (`api/_lib/essayGuard.ts`).
- The daily limits on the help chat and on bug reports refuse the request when they cannot be checked, instead of letting it through.
- Opening a `/feedback/...` link does not start a report by itself, unless that tab's own writing page just opened it (`src/lib/feedbackIntent.ts`). The link carries the whole essay, so anyone can make one.
- Blog posts are stored as HTML and cleaned before they are shown (`src/lib/sanitizeHtml.ts`).
- Analytics is off. `src/lib/consent.ts` says it must wait for consent, and the cookie notice promises no tracking.
- Security headers are set in `vercel.json`. The full Content-Security-Policy is sent as **Report-Only** so it cannot break the site: browse every page, signed in and out, with the console open, fix or allow what it reports, then rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.

### Before deploying this change

Do these in order:

1. Add `CRON_SECRET` in Vercel (Production). Any long random string.
2. Set a new `ADMIN_PASSWORD` (20+ random characters) in Vercel. Delete `VITE_LOGIN`, `VITE_PASSWORD` and `VITE_IMGBB_API` from Vercel and `.env`.
3. Only if any center students exist by then: confirm their emails, once. It only touches accounts with a center profile, and does nothing without `--apply`:

   ```bash
   npx tsx scripts/verify-center-students.ts
   npx tsx scripts/verify-center-students.ts --apply
   ```

   Without this step, center students made before this change are signed out and cannot get back in. When it was checked on 2026-09-29 there were none (0 center profiles, 0 `@writeready.student` accounts), so it changed nothing. Students made from now on are confirmed when they are created.
4. Deploy.
5. Publish `firestore.rules` in the Firebase console (Firestore > Rules). A browser that still holds the old site for a while will fail on likes and Human Check until it reloads.
6. Connect the bot again only if you change its token:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://www.writeready.uz/api/telegram?force=1"`

## Checks that run offline

```bash
npx tsx scripts/test-security-fixes.ts    # sentence cap, refund budget, staff tokens, cron secret, links
npx tsx scripts/test-email-code.ts        # email codes and the email gate
npx tsx scripts/test-student-bot.ts       # the Telegram bot
npx tsx scripts/test-score-store.ts       # saved reports and score-card verification
```

`scripts/test-email-code-auth.ts` needs the Firebase Auth emulator. Firestore rules have no local test yet: the emulator needs Java.
