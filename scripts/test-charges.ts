/**
 * Offline checks for api/_lib/charges.ts: a credit taken for a report that
 * never finished always comes back, once, into the allowance it came from.
 *
 *   npx tsx scripts/test-charges.ts
 */
import { CHARGE_TTL_MS, chargeIdOf, newCharge, refundFields, sweepStaleCharges } from '../api/_lib/charges.js';
import { planCycle } from '../api/_lib/planCycle.js';
import { currentWeekKey } from '../api/_lib/shared.js';

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures++;
}

const now = Date.now();
const expiresAt = new Date(now + 20 * 86_400_000).toISOString();
const cycle = planCycle(expiresAt).key;
const week = currentWeekKey();

console.log('\ncharge ids');
check('the same token always names the same charge', chargeIdOf('abc') === chargeIdOf('abc'));
check('different tokens name different charges', chargeIdOf('abc') !== chargeIdOf('abd'));

console.log('\nrefunds');
{
  const paid = { plan: 'premium', expiresAt, usage: { monthKey: cycle, count: 4 } };
  check('a paid credit goes back into this plan month', JSON.stringify(refundFields(paid, 'paid', newCharge('paid', paid, now))) === JSON.stringify({ usage: { monthKey: cycle, count: 3 } }));
  check('one from a month that has renewed gives nothing back', Object.keys(refundFields(paid, 'paid', { source: 'paid', at: now, cycle: '1999-01-01' })).length === 0);
  check('the count never goes below zero', Object.keys(refundFields({ ...paid, usage: { monthKey: cycle, count: 0 } }, 'paid', null)).length === 0);
  const free = { freeUsage: { weekKey: week, count: 1 } };
  check('the weekly free report comes back this week', (refundFields(free, 'free', newCharge('free', free, now)).freeUsage as { count: number }).count === 0);
  check('but not into another week', Object.keys(refundFields(free, 'free', { source: 'free', at: now, week: '1999-W01' })).length === 0);
  check('a bonus comes back as a bonus', refundFields({ bonusAnalyses: 2 }, 'bonus', null).bonusAnalyses === 3);
}

console.log('\nsweep');
{
  const fresh = { source: 'paid', at: now - 60_000, cycle };
  const stale = { source: 'paid', at: now - CHARGE_TTL_MS - 1, cycle };
  const staleBonus = { source: 'bonus', at: now - CHARGE_TTL_MS - 1 };
  const data = {
    plan: 'premium', expiresAt, usage: { monthKey: cycle, count: 5 }, bonusAnalyses: 0,
    pendingCharges: { a: fresh, b: stale, c: staleBonus, d: 'junk' },
  };
  const { fields, data: after, refunded } = sweepStaleCharges(data, now);
  check('a report that may still be writing is left alone', 'a' in (after.pendingCharges as object));
  check('stale charges are given back', refunded === 2);
  check('each into its own allowance', (fields.usage as { count: number }).count === 4 && fields.bonusAnalyses === 1);
  check('stale and unreadable entries are cleared', ['b', 'c', 'd'].every((k) => k in (fields.pendingCharges as object)) && !('a' in (fields.pendingCharges as object)));
  check('the numbers after the sweep are the corrected ones', (after.usage as { count: number }).count === 4);
  const twice = sweepStaleCharges(after, now);
  check('a second sweep gives nothing more back', twice.refunded === 0 && Object.keys(twice.fields).length === 0);
  const two = sweepStaleCharges({ ...data, pendingCharges: { b: stale, e: { ...stale } } }, now);
  check('two stale paid charges give two credits back', (two.fields.usage as { count: number }).count === 3);
  check('a profile with nothing pending is untouched', Object.keys(sweepStaleCharges({ plan: 'free' }, now).fields).length === 0);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
