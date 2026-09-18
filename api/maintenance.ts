import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initFirebase } from './_lib/shared.js';

// Site-wide maintenance flag, stored on the same `config/featureFlags` doc
// the client already reads for other flags. Reads go through this endpoint
// (via the Admin SDK) rather than the Firestore client SDK, so an anonymous
// visitor can check maintenance status without needing a Firestore rule that
// opens that doc to public reads. Writes require a Firebase ID token for the
// fixed admin account minted in api/staff-login.ts.
const ADMIN_EMAIL = 'admin@writeready.internal';

const UNITS = ['hours', 'days', 'months'] as const;
type Unit = (typeof UNITS)[number];
const MAX_DURATION_MS = 366 * 86_400_000;

interface StoredFlags {
  maintenanceMode?: boolean;
  maintenanceStartedAt?: Timestamp | null;
  maintenanceEndsAt?: Timestamp | null;
}

function toStatus(data: StoredFlags | undefined) {
  return {
    enabled: data?.maintenanceMode === true,
    startedAt: data?.maintenanceStartedAt?.toMillis() ?? null,
    endsAt: data?.maintenanceEndsAt?.toMillis() ?? null,
  };
}

function addDuration(from: Date, amount: number, unit: Unit): Date {
  if (unit === 'hours') return new Date(from.getTime() + amount * 3_600_000);
  if (unit === 'days') return new Date(from.getTime() + amount * 86_400_000);
  // Calendar months, clamped so Jan 31 + 1 month lands on the last day of Feb, not Mar 3.
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + amount);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d;
}

// Turns a request body plus the currently stored flags into the fields to
// write. Changing the duration while maintenance is already on keeps the
// original start time and only moves the planned end.
export function planMaintenanceUpdate(
  body: unknown,
  current: StoredFlags | undefined,
  now: Date,
): { error: string } | { fields: Required<StoredFlags> } {
  const { enabled, amount, unit } = (body ?? {}) as Record<string, unknown>;
  if (typeof enabled !== 'boolean') return { error: 'enabled must be a boolean.' };
  if (!enabled) {
    return { fields: { maintenanceMode: false, maintenanceStartedAt: null, maintenanceEndsAt: null } };
  }
  if (!UNITS.includes(unit as Unit)) return { error: 'unit must be hours, days, or months.' };
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) {
    return { error: 'amount must be a whole number, 1 or more.' };
  }
  const endsAt = addDuration(now, amount, unit as Unit);
  if (!(endsAt.getTime() - now.getTime() <= MAX_DURATION_MS)) {
    return { error: 'The longest maintenance you can set is 12 months.' };
  }
  const keptStart = current?.maintenanceMode === true ? current.maintenanceStartedAt : null;
  return {
    fields: {
      maintenanceMode: true,
      maintenanceStartedAt: keptStart ?? Timestamp.fromDate(now),
      maintenanceEndsAt: Timestamp.fromDate(endsAt),
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }
  const flagRef = getFirestore().collection('config').doc('featureFlags');

  if (req.method === 'GET') {
    const snap = await flagRef.get();
    // Every open tab polls this, so let the CDN answer repeats: the function
    // (and its Firestore read) runs at most ~once per 5s per region, not per visitor.
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
    return res.status(200).json(toStatus(snap.data() as StoredFlags | undefined));
  }

  if (req.method === 'POST') {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token.' });

    let email: string | undefined;
    try {
      email = (await getAuth().verifyIdToken(token)).email;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });

    const current = (await flagRef.get()).data() as StoredFlags | undefined;
    const plan = planMaintenanceUpdate(req.body, current, new Date());
    if ('error' in plan) return res.status(400).json({ error: plan.error });

    await flagRef.set(plan.fields, { merge: true });
    return res.status(200).json(toStatus(plan.fields));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
