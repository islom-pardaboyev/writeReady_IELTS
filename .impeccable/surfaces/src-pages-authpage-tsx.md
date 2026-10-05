---
version: 1
slug: "src-pages-authpage-tsx"
primary_target: "src/pages/AuthPage.tsx"
related_targets: ["src/components/auth/AuthAside.tsx", "src/components/auth/AuthNotice.tsx", "src/components/auth/PasswordRequirements.tsx", "src/components/auth/EmailCodeSignIn.tsx", "src/components/landing/ReportSample.tsx"]
---

Scope: `/auth`, every state of it: sign in, create account, learning-centre sign-in, sign in with an emailed code, and confirming an email with a code. Mode: Convert, then get out of the way.

Audience: IELTS candidates in Uzbekistan, mostly on phones, who just pressed "Check my essay" or "Start Free" on the home page, and returning students. Job: get into the account in as few moves as possible, and, when signing up, choose a password that passes the rules first time. Action: the one Ink Blue button of the form.

## Direction contract

THESIS: A sheet and its margin. On a wide screen the page is split like an answer booklet: a dark ruled margin on the left that reminds the visitor what they are signing up for (the promise line and a sample report), and a white sheet on the right that holds only the form. On a phone the margin goes, and the sheet is the whole screen.

OWN-WORLD: Ink on Paper from DESIGN.md. The margin is the landing page's slate close with the same 36px answer-sheet ruling, the promise line in white extrabold with "cost you marks." in Ink Blue, and the landing page's sample report (`ReportSample`) captioned as a sample. The sheet is Sheet White with hairlines; Ink Blue marks only the primary button, the chosen segment and focus.

FIRST VIEWPORT (form side): a top row with the logo on phones and "Back to home" from 1024px; then a 420px column: the Sign in / Create account segmented control, a 30px bold title with one Slate Gray line under it, Continue with Google (outline), "or with email", the fields, the primary button, one caption, and the learning-centre link under a hairline.

FIELDS: 48px tall, 16px text (a phone does not zoom into a field with 16px text), 14px semibold labels, 16px between fields. On sign-in, "Forgot password?" sits at the right of the password label, where people look for it. Errors from the server are a Notice (tint, border, triangle icon) above the form; a problem with one field is said under that field.

PASSWORD RULES (create account, change password): the rules are not shouted at someone who has not typed yet. Empty field: one Slate Gray hint line. Typing a password that misses a rule: a five-step strength bar (red, then amber) with its word, and the five rules as a checklist, met ones ticked in emerald. All met: the list folds into one emerald "Strong password" line. Pressing the button too early turns the missing rules red and says so under the field, and focus goes back to the field; no code is sent.

MOTION: none on load. State colours change over 150ms.

DON'T: no second solid button, no kicker labels, no emoji, no card-in-card: the sheet side has no card around the form.
