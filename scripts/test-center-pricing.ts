/**
 * Offline checks for the learning-center price calculator (src/lib/centerPricing.ts):
 * no place is ever sold under what its AI costs, and quotes above that floor
 * are priced exactly as before.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/test-center-pricing.ts
 */
import { CENTER_PLAN_IDS, SEAT_TIERS, floorPerSeatMonthUZS, quoteCenter, tierFor } from '../src/lib/centerPricing.js';
import { PLAN_INFO } from '../src/lib/plans.js';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}

/** The calculator before the floor, to show nothing above the floor moved. */
function oldTotal(planId: string, seats: number, months: number, extra: number): number {
  const price = PLAN_INFO[planId as 'basic'].monthlyPriceUZS;
  const ladder = (n: number) => price * n * months * (1 - tierFor(n).percent / 100);
  let best = ladder(seats);
  for (const t of SEAT_TIERS) if (t.minSeats > seats) best = Math.min(best, ladder(t.minSeats));
  return Math.round((best * (1 - extra / 100)) / 1000) * 1000;
}

console.log('\nThe floor');
check('Basic: 5 reports, no place under 8,000 a month', floorPerSeatMonthUZS('basic') === 8_000);
check('Standard: 12 reports, no place under 18,000 a month', floorPerSeatMonthUZS('standard') === 18_000);
check('Premium: 25 reports, no place under 38,000 a month', floorPerSeatMonthUZS('premium') === 38_000);
check('every floor is under the retail price', CENTER_PLAN_IDS.every((p) => floorPerSeatMonthUZS(p) < PLAN_INFO[p].monthlyPriceUZS));

console.log('\nThe cases that lost money');
{
  const q = quoteCenter({ planId: 'premium', seats: 100, months: 12 });
  check('Premium, 100 places: 38,000 a place instead of 29,400', q.perSeatMonthUZS === 38_000, String(q.perSeatMonthUZS));
  check('... and the quote says by how much it was raised', q.raisedToFloorUZS === 38_000 * 100 * 12 - 29_400 * 100 * 12, String(q.raisedToFloorUZS));
  const deep = quoteCenter({ planId: 'premium', seats: 100, months: 12, extraPercent: 50 });
  check('Premium, 100 places and the full 50% extra: 38,000 instead of 14,700', deep.perSeatMonthUZS === 38_000, String(deep.perSeatMonthUZS));
  const std = quoteCenter({ planId: 'standard', seats: 50, months: 6, extraPercent: 30 });
  check('Standard, 50 places and 30% extra: 18,000 instead of 14,210', std.perSeatMonthUZS === 18_000, String(std.perSeatMonthUZS));
}

console.log('\nEvery quote');
{
  let quotes = 0;
  let underFloor = 0;
  let changedAbove = 0;
  let paysMoreForLess = 0;
  let freeUnderFloor = 0;
  let mathOff = 0;
  let freeChangesPrice = 0;
  let linesOff = 0;
  for (const planId of CENTER_PLAN_IDS) {
    const floor = floorPerSeatMonthUZS(planId);
    for (const months of [1, 3, 6, 12, 24]) {
      for (const extra of [0, 5, 10, 20, 30, 40, 50]) {
        let previous = 0;
        for (let seats = 1; seats <= 160; seats++) {
          const q = quoteCenter({ planId, seats, months, extraPercent: extra });
          quotes++;
          if (q.totalUZS < floor * seats * months) underFloor++;
          // Given places are places too: they must not go under the floor
          // either, and taking them must not change the price.
          if (q.freeSeats) {
            if (q.totalUZS < floor * q.freeSeats.seats * months) freeUnderFloor++;
            if (quoteCenter({ planId, seats: q.freeSeats.seats, months, extraPercent: extra }).totalUZS !== q.totalUZS) freeChangesPrice++;
          }
          // Where the old price was already above the floor, nothing changes.
          const old = oldTotal(planId, seats, months, extra);
          if (old >= floor * seats * months && q.totalUZS !== old) changedAbove++;
          if (q.raisedToFloorUZS === 0 && q.totalUZS !== old) mathOff++;
          // The lines of the quote add up to its total.
          if (q.totalUZS !== old + q.raisedToFloorUZS) linesOff++;
          if (q.totalUZS < previous) paysMoreForLess++;
          previous = q.totalUZS;
        }
      }
    }
  }
  check(`no place under the floor, in ${quotes} quotes`, underFloor === 0, `${underFloor} under`);
  check('no free places under the floor', freeUnderFloor === 0, `${freeUnderFloor} under`);
  check('taking the offered free places keeps the price', freeChangesPrice === 0, `${freeChangesPrice} changed`);
  check('discounts plus "raised to the lowest price" add up to the total', linesOff === 0, `${linesOff} off`);
  check('quotes above the floor are priced as before', changedAbove === 0, `${changedAbove} changed`);
  check('a quote that was not raised is the old price', mathOff === 0, `${mathOff} off`);
  check('a center never pays more for fewer places', paysMoreForLess === 0, `${paysMoreForLess} times`);
}

console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
