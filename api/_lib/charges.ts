import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { currentWeekKey } from './shared.js';
import { planCycle, usedThisCycle } from './planCycle.js';

/**
 * A student never pays for a report they did not get.
 *
 * api/pre-check.ts takes a credit before the AI writes, because the AI costs
 * money the moment it starts. Every credit it takes is written down on the
 * student's profile in the same transaction, as a pending charge:
 *
 *   users/{uid}.pendingCharges.{chargeId} = { source, at, cycle | week }
 *
 * api/feedback.ts settles it: keepCharge() once the report is saved, or a
 * refund when the report fails. Before this, a report could fail without the
 * refund ever running: the browser lost the connection before asking for the
 * report, or the function hit its 300-second limit and was stopped mid-write.
 * The student then saw "you were not charged" and had lost a report.
 *
 * A charge still pending after CHARGE_TTL_MS belongs to a report that can no
 * longer finish, so the next pre-check or /api/seen gives it back
 * (sweepStaleCharges). The token pre-check signs works for 3 minutes and the
 * function runs for at most 300 seconds, so no report is still being written
 * after 8 minutes.
 */

export type CreditSource = 'paid' | 'bonus' | 'free';

export const CHARGE_TTL_MS = 9 * 60 * 1000;

/** The pending charge's key, from the signature of the token that carries it. */
export const chargeIdOf = (tokenSig: string): string =>
  createHash('sha256').update(tokenSig).digest('hex').slice(0, 24);

export interface PendingCharge {
  source: CreditSource;
  /** When it was taken, in ms. The same moment the token is signed with. */
  at: number;
  /** The plan month a 'paid' credit came from (planCycle key). */
  cycle?: string;
  /** The week a 'free' credit came from (currentWeekKey). */
  week?: string;
}

type UserData = Record<string, unknown>;

export function newCharge(source: CreditSource, data: UserData, at: number): PendingCharge {
  if (source === 'paid') return { source, at, cycle: planCycle(data.expiresAt).key };
  if (source === 'free') return { source, at, week: currentWeekKey() };
  return { source, at };
}

export function readCharge(value: unknown): PendingCharge | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  if ((c.source !== 'paid' && c.source !== 'bonus' && c.source !== 'free') || typeof c.at !== 'number') return null;
  return {
    source: c.source,
    at: c.at,
    ...(typeof c.cycle === 'string' ? { cycle: c.cycle } : {}),
    ...(typeof c.week === 'string' ? { week: c.week } : {}),
  };
}

export const pendingChargeOf = (data: UserData, chargeId: string): PendingCharge | null =>
  readCharge((data.pendingCharges as Record<string, unknown> | undefined)?.[chargeId]);

/**
 * The profile fields that give one credit back into the allowance it came
 * from. Empty when there is nothing to give back: the plan month or week it
 * was taken from is over, and the count has already started again.
 */
export function refundFields(data: UserData, source: CreditSource, charge: PendingCharge | null): UserData {
  if (source === 'bonus') {
    const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
    return { bonusAnalyses: bonus + 1 };
  }
  if (source === 'free') {
    const weekKey = currentWeekKey();
    if (charge?.week && charge.week !== weekKey) return {};
    const free = data.freeUsage as { weekKey?: unknown; count?: unknown } | undefined;
    return free?.weekKey === weekKey && typeof free.count === 'number' && free.count > 0
      ? { freeUsage: { weekKey, count: free.count - 1 } }
      : {};
  }
  const cycle = planCycle(data.expiresAt).key;
  if (charge?.cycle && charge.cycle !== cycle) return {};
  const used = usedThisCycle(data.usage, data.expiresAt);
  return used > 0 ? { usage: { monthKey: cycle, count: used - 1 } } : {};
}

/** Clears one pending charge, inside a set(..., { merge: true }). */
export const clearCharge = (chargeId: string) => ({ [chargeId]: FieldValue.delete() });

/**
 * Gives back every charge pending longer than CHARGE_TTL_MS. Returns the
 * fields to merge into the profile, `data` as it will read afterwards (so a
 * caller in the same transaction can take a new credit from the corrected
 * numbers), and how many were given back. `fields` is empty when there is
 * nothing to do.
 */
export function sweepStaleCharges(data: UserData, now = Date.now()): { fields: UserData; data: UserData; refunded: number } {
  const pending = (data.pendingCharges && typeof data.pendingCharges === 'object' ? data.pendingCharges : {}) as Record<string, unknown>;
  let after: UserData = data;
  const refunds: UserData = {};
  const cleared: Record<string, unknown> = {};
  const left: Record<string, unknown> = {};
  let refunded = 0;
  for (const [id, value] of Object.entries(pending)) {
    const charge = readCharge(value);
    if (charge && now - charge.at < CHARGE_TTL_MS) {
      left[id] = value;
      continue;
    }
    cleared[id] = FieldValue.delete();
    if (!charge) continue; // unreadable: drop it
    const back = refundFields(after, charge.source, charge);
    Object.assign(refunds, back);
    after = { ...after, ...back };
    if (Object.keys(back).length) refunded++;
  }
  if (!Object.keys(cleared).length) return { fields: {}, data, refunded: 0 };
  return { fields: { ...refunds, pendingCharges: cleared }, data: { ...after, pendingCharges: left }, refunded };
}
