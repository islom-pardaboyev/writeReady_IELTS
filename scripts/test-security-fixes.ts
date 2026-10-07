/**
 * Checks the logic behind the security fixes, offline.
 *
 *   npx tsx scripts/test-security-fixes.ts
 *
 * Nothing here reaches Firebase, Firestore, Vercel or any paid API. It covers
 * the parts that are plain functions:
 *
 *   - the sentence cap and the daily refund budget (api/_lib/essayGuard.ts)
 *   - which tokens count as the admin or a centre (api/_lib/shared.ts): the
 *     role api/staff-login.ts writes into the token, never the email
 *   - who may run the cron job (api/_lib/cronAuth.ts)
 *   - which links a blog post may keep (src/lib/sanitizeHtml.ts, safeHref)
 *   - which report links may start a report by themselves (src/lib/feedbackIntent.ts)
 *
 * The blog sanitizer itself needs a browser's DOM, so it is checked in the
 * browser (see the notes where it is used). Firestore rules need the emulator.
 */
import {
  MAX_AI_REFUNDS_PER_DAY, MAX_SENTENCES, countSentences, nextRefundUsage, reportsPaused,
} from '../api/_lib/essayGuard.js';
import { isAdminToken, isCenterToken, staffTokenOf } from '../api/_lib/shared.js';
import { cronAllowed } from '../api/_lib/cronAuth.js';
import { safeHref } from '../src/lib/sanitizeHtml.js';

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures++;
}

// ── Sentence cap ─────────────────────────────────────────────────────────────
console.log('sentence cap');
{
  const essay = 'Some people think that cities are too crowded. Others disagree. In my view, the answer depends on planning! Is growth good? It can be.';
  check('a normal paragraph counts its sentences', countSentences(essay) === 5);
  check('a decimal or a percentage is not a sentence end', countSentences('Sales rose 3.5% in 2020. They fell 1.2% later.') === 2);
  check('a line with no full stop still counts', countSentences('First line\nSecond line\nThird line') === 3);
  check('punctuation and blank lines alone count for nothing', countSentences('... !!! \n\n ???') === 0);
  check('empty text is zero', countSentences('') === 0);
  check('letters outside English count', countSentences('Bu yaxshi. Это хорошо. Ünlü.') === 3);

  // The attack: a thousand one-word sentences always ran to the token cap.
  const flood = 'Yes. '.repeat(1000);
  check('a thousand one-word sentences is over the cap', countSentences(flood) === 1000 && countSentences(flood) > MAX_SENTENCES);
  const lines = 'Yes\n'.repeat(500);
  check('so are five hundred one-word lines', countSentences(lines) > MAX_SENTENCES);

  // A long but real essay stays under it: 1,000 words at 14 words a sentence.
  const real = Array.from({ length: 70 }, () => 'This sentence has about fourteen words in it so that it looks like real writing today.').join(' ');
  check('a long real essay (70 sentences) is under the cap', countSentences(real) === 70 && countSentences(real) <= MAX_SENTENCES);
}

// ── Refund budget ────────────────────────────────────────────────────────────
console.log('\nrefund budget');
{
  const today = '2026-09-29';
  const first = nextRefundUsage(undefined, today);
  check('the first refund of the day is counted', first.count === 1 && first.dayKey === today);
  let cur: unknown = undefined;
  for (let i = 0; i < MAX_AI_REFUNDS_PER_DAY + 4; i++) cur = nextRefundUsage(cur, today);
  check('every failed report is refunded, however many there are', (cur as { count: number }).count === MAX_AI_REFUNDS_PER_DAY + 4);
  let fresh: unknown = undefined;
  for (let i = 0; i < MAX_AI_REFUNDS_PER_DAY - 1; i++) fresh = nextRefundUsage(fresh, today);
  check('new reports are not paused below the limit', !reportsPaused(fresh, today));
  check(`new reports pause after ${MAX_AI_REFUNDS_PER_DAY} failed ones`, reportsPaused(nextRefundUsage(fresh, today), today));
  check('a new day starts again', !reportsPaused(cur, '2026-09-30') && nextRefundUsage(cur, '2026-09-30').count === 1);
  check('junk in the stored field does not lock anyone out', !reportsPaused('x', today) && !reportsPaused({ dayKey: today, count: 'a' }, today));
  check('a negative stored count counts from zero', nextRefundUsage({ dayKey: today, count: -50 }, today).count === 1);
}

// ── Admin and centre tokens ──────────────────────────────────────────────────
console.log('\nstaff tokens');
{
  // A verified ID token as verifyIdToken returns it: the provider, the email,
  // and any claims the server put in the custom token.
  const t = (provider: string, email: string, claims: Record<string, unknown> = {}) =>
    staffTokenOf({ uid: 'u', email, firebase: { sign_in_provider: provider }, ...claims });
  const admin = t('custom', 'admin@writeready.internal', { staff: 'admin' });
  const centre = t('custom', 'center_abc@writeready.internal', { staff: 'center', centerId: 'abc' });
  const teacher = t('custom', 'teacher_t1@writeready.internal', { staff: 'teacher', teacherId: 't1' });

  check('the admin token from staff-login is the admin', isAdminToken(admin));
  check('a centre token is that centre', isCenterToken(centre, 'abc'));
  check('but not another centre', !isCenterToken(centre, 'abd'));
  check('a centre id differing only in case is another centre', !isCenterToken(t('custom', '', { staff: 'center', centerId: 'AbC' }), 'abc'));
  check('a centre is not the admin', !isAdminToken(centre));
  check('a teacher is neither', !isAdminToken(teacher) && !isCenterToken(teacher, 't1'));
  check('no token is not the admin', !isAdminToken(null));

  // The attack: an email-code sign-in (a custom token with no claims) whose
  // email was changed to a staff address.
  check('a custom token with the admin email but no role is not staff', t('custom', 'admin@writeready.internal') === null);
  check('nor with a centre email', t('custom', 'center_abc@writeready.internal') === null && !isCenterToken(t('custom', 'center_abc@writeready.internal'), 'abc'));
  check('a staff session from before roles is not staff (asked to sign in again)', t('custom', 'teacher_t1@writeready.internal') === null);
  check('a role on a password sign-in is ignored', t('password', 'admin@writeready.internal', { staff: 'admin' }) === null);
  check('a role on a Google sign-in is ignored', t('google.com', 'x@gmail.com', { staff: 'admin' }) === null);
  check('an unknown role is not staff', t('custom', '', { staff: 'owner' }) === null);
  check('a centre role with no centre id is not staff', t('custom', '', { staff: 'center' }) === null);
  check('a teacher role with no teacher id is not staff', t('custom', '', { staff: 'teacher' }) === null);
  check('a centre id that is not text is not staff', t('custom', '', { staff: 'center', centerId: 7 }) === null);
  check('an empty centre id never matches', !isCenterToken(centre, ''));
}

// ── Cron secret ──────────────────────────────────────────────────────────────
console.log('\ncron secret');
{
  const req = (authorization?: string) => ({ headers: authorization === undefined ? {} : { authorization } }) as never;
  const saved = { secret: process.env.CRON_SECRET, env: process.env.VERCEL_ENV };
  process.env.VERCEL_ENV = 'production';
  delete process.env.CRON_SECRET;
  check('production with no secret set refuses everyone', !cronAllowed(req('Bearer anything')) && !cronAllowed(req()));
  process.env.CRON_SECRET = 'correct-horse-battery-staple';
  check('the right secret is accepted', cronAllowed(req('Bearer correct-horse-battery-staple')));
  check('no header is refused', !cronAllowed(req()));
  check('a wrong secret is refused', !cronAllowed(req('Bearer wrong-horse-battery-staple')));
  check('a secret of another length is refused', !cronAllowed(req('Bearer x')));
  check('the secret without "Bearer" is refused', !cronAllowed(req('correct-horse-battery-staple')));
  delete process.env.CRON_SECRET;
  process.env.VERCEL_ENV = 'preview';
  check('a preview deployment with no secret set refuses everyone', !cronAllowed(req()) && !cronAllowed(req('Bearer anything')));
  process.env.VERCEL_ENV = 'development';
  check('local development runs without a secret', cronAllowed(req()));
  if (saved.secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved.secret;
  if (saved.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.env;
}

// ── Links a blog post may keep ───────────────────────────────────────────────
console.log('\nlinks in blog posts');
{
  check('a web address is kept', safeHref('https://writeready.uz/pricing') === 'https://writeready.uz/pricing');
  check('a mail link is kept', safeHref('mailto:hi@writeready.uz') === 'mailto:hi@writeready.uz');
  check('an address on this site is kept', safeHref('/blog/tips') === '/blog/tips');
  check('a #fragment is kept', safeHref('#top') === '#top');
  check('javascript: is dropped', safeHref('javascript:alert(1)') === null);
  check('with capitals', safeHref('JaVaScRiPt:alert(1)') === null);
  check('with a tab inside the word', safeHref('java\tscript:alert(1)') === null);
  check('with a newline inside the word', safeHref('java\nscript:alert(1)') === null);
  check('with leading spaces and control characters', safeHref('  \u0001javascript:alert(1)') === null);
  check('with a zero-width space', safeHref('java\u200bscript:alert(1)') === null);
  check('data: is dropped', safeHref('data:text/html,<script>alert(1)</script>') === null);
  check('vbscript: is dropped', safeHref('vbscript:msgbox(1)') === null);
  check('a //host address that leaves the site is dropped', safeHref('//evil.example/x') === null);
  check('and its backslash form', safeHref('/\\evil.example/x') === null);
  check('a bare word is dropped', safeHref('www.example.com') === null);
}

// ── Which report links start by themselves ──────────────────────────────────
console.log('\nreport links');
{
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  const { allowFeedbackStart, mayStartFeedback } = await import('../src/lib/feedbackIntent.js');
  const mine = 'eyJ0YXNrMiI6e30sInVzZXJUZXh0MiI6Im15IGVzc2F5In0';
  const crafted = 'eyJ0YXNrMiI6e30sInVzZXJUZXh0MiI6ImF0dGFja2VyIGVzc2F5In0';
  check('a link nobody marked does not start by itself', !mayStartFeedback(mine));
  allowFeedbackStart(mine);
  check('the link the writing page just opened does', mayStartFeedback(mine));
  check('a different link (someone else\'s essay) does not', !mayStartFeedback(crafted));
  check('an empty address never does', !mayStartFeedback(undefined) && !mayStartFeedback(''));
  allowFeedbackStart(crafted);
  check('only the newest link is remembered', mayStartFeedback(crafted) && !mayStartFeedback(mine));
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  check('blocked storage falls back to asking for a click', !mayStartFeedback(crafted));
  let threw = false;
  try { allowFeedbackStart(crafted); } catch { threw = true; }
  check('and never throws', !threw);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
