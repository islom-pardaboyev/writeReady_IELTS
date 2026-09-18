import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initFirebase } from './_lib/shared.js';

// Site-wide maintenance flag, stored on the same `config/featureFlags` doc
// the client already reads for other flags. Reads go through this endpoint
// (via the Admin SDK) rather than the Firestore client SDK, so an anonymous
// visitor can check maintenance status without needing a Firestore rule that
// opens that doc to public reads. Writes require a Firebase ID token for the
// fixed admin account minted in api/staff-login.ts.
const ADMIN_EMAIL = 'admin@writeready.internal';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }
  const db = getFirestore();
  const flagRef = db.collection('config').doc('featureFlags');

  if (req.method === 'GET') {
    const snap = await flagRef.get();
    const data = snap.data();
    const startedAt = data?.maintenanceStartedAt?.toMillis?.() ?? null;
    // Every open tab polls this, so let the CDN answer repeats: the function
    // (and its Firestore read) runs at most ~once per 5s per region, not per visitor.
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
    return res.status(200).json({ enabled: data?.maintenanceMode === true, startedAt });
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

    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean.' });

    await flagRef.set(
      { maintenanceMode: enabled, maintenanceStartedAt: enabled ? FieldValue.serverTimestamp() : null },
      { merge: true },
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
