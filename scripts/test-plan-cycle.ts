/**
 * Checks when a paid plan's monthly allowance renews, offline.
 *
 *   npx tsx scripts/test-plan-cycle.ts
 *
 * The allowance used to refill on the 1st of every calendar month, so a plan
 * given on 20 May was refilled on 1 June. It now runs from the plan's own
 * dates (api/_lib/planCycle.ts). Nothing here reaches Firebase.
 */
import { monthAfter, nextRenewal, planCycle, usedThisCycle } from '../api/_lib/planCycle.js';

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures++;
}

const at = (iso: string) => new Date(iso);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ── The case that was wrong ─────────────────────────────────────────────────
console.log('a plan given on 20 May');
{
  const given = at('2026-05-20T09:00:00Z');
  const expiresAt = monthAfter(null, given);
  check('ends on 20 June', expiresAt === '2026-06-20');

  // Spent 5 reports on 25 May, as pre-check writes them.
  const usage = { monthKey: planCycle(expiresAt, at('2026-05-25T10:00:00Z')).key, count: 5 };
  check('the month is keyed by the day it began', usage.monthKey === '2026-05-20');
  check('still 5 used on 31 May', usedThisCycle(usage, expiresAt, at('2026-05-31T23:00:00Z')) === 5);
  check('still 5 used on 1 June: no refill on the 1st', usedThisCycle(usage, expiresAt, at('2026-06-01T00:00:00Z')) === 5);
  check('still 5 used on 19 June', usedThisCycle(usage, expiresAt, at('2026-06-19T23:59:00Z')) === 5);
  check('no renewal while the plan ends first', nextRenewal(expiresAt, at('2026-05-25T10:00:00Z')) === null);

  // Renewed early, on 15 June: a month is added to what is left.
  const renewed = monthAfter(expiresAt, at('2026-06-15T08:00:00Z'));
  check('renewing early runs to 20 July', renewed === '2026-07-20');
  check('renewing early keeps the count', usedThisCycle(usage, renewed, at('2026-06-15T08:00:00Z')) === 5);
  check('renewal is shown as 20 June', day(nextRenewal(renewed, at('2026-06-15T08:00:00Z'))) === '2026-06-20');
  check('refilled on 20 June', usedThisCycle(usage, renewed, at('2026-06-20T00:00:00Z')) === 0);
  check('the next month runs to 20 July', day(planCycle(renewed, at('2026-06-25T00:00:00Z')).renewsAt) === '2026-07-20');
}

// ── Month lengths ───────────────────────────────────────────────────────────
console.log('month lengths');
{
  check('31 January plus a month is 28 February', monthAfter(null, at('2026-01-31T12:00:00Z')) === '2026-02-28');
  check('31 January plus a month is 29 February in a leap year', monthAfter(null, at('2028-01-31T12:00:00Z')) === '2028-02-29');
  check('31 December plus a month is 31 January', monthAfter(null, at('2026-12-31T12:00:00Z')) === '2027-01-31');
  // A 31st plan in a short month starts on its last day.
  const c = planCycle('2026-03-31', at('2026-03-10T00:00:00Z'));
  check('a plan ending on the 31st: month began 28 February', day(c.start) === '2026-02-28');
  check('a plan ending on the 31st: renews 31 March', day(c.renewsAt) === '2026-03-31');
  const d = planCycle('2026-12-31', at('2026-04-30T12:00:00Z'));
  check('a 31st plan begins its month on 30 April', day(d.start) === '2026-04-30');
  check('and renews on 31 May', day(d.renewsAt) === '2026-05-31');
  check('across the new year', day(planCycle('2027-03-15', at('2027-01-05T00:00:00Z')).start) === '2026-12-15');
}

// ── Long contracts (learning centres) ──────────────────────────────────────
console.log('a learning-centre contract');
{
  const expiresAt = '2027-04-02T23:59:59';
  const c = planCycle(expiresAt, at('2026-10-10T00:00:00Z'));
  check('renews monthly on the contract day', day(c.start) === '2026-10-02' && day(c.renewsAt) === '2026-11-02');
  check('shows the next renewal', day(nextRenewal(expiresAt, at('2026-10-10T00:00:00Z'))) === '2026-11-02');
  check('no renewal on the last day of the contract', nextRenewal(expiresAt, at('2027-03-20T00:00:00Z')) === null);
}

// ── No end date ─────────────────────────────────────────────────────────────
console.log('a plan with no end date (Lifetime)');
{
  const c = planCycle('', at('2026-10-02T10:00:00Z'));
  check('keeps the calendar month', c.key === '2026-10' && day(c.start) === '2026-10-01' && day(c.renewsAt) === '2026-11-01');
  check('a bad date is no date', planCycle('soon', at('2026-10-02T10:00:00Z')).key === '2026-10');
  check('counts against the calendar month', usedThisCycle({ monthKey: '2026-10', count: 40 }, undefined, at('2026-10-20T00:00:00Z')) === 40);
}

// ── Counts written before plan months existed ──────────────────────────────
console.log('older counts');
{
  const expiresAt = '2026-10-20';
  const now = at('2026-10-02T10:00:00Z');
  check('this calendar month still counts inside the plan month', usedThisCycle({ monthKey: '2026-10', count: 3 }, expiresAt, now) === 3);
  check('last calendar month was already cleared on the 1st', usedThisCycle({ monthKey: '2026-09', count: 3 }, expiresAt, now) === 0);
  check('after the plan renews, it is gone', usedThisCycle({ monthKey: '2026-10', count: 3 }, expiresAt, at('2026-10-20T00:00:00Z')) === 0);
  check('a plan given after the 1st starts clean', usedThisCycle({ monthKey: '2026-10', count: 3 }, '2026-11-02', now) === 0);
  check('nothing stored is nothing used', usedThisCycle(undefined, expiresAt, now) === 0);
  check('a bad count is nothing used', usedThisCycle({ monthKey: '2026-09-20', count: 'x' }, expiresAt, now) === 0);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
