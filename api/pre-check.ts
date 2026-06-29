import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac } from 'crypto';

const CENTER_MONTHLY_LIMIT = 15;

type CreditErrorCode = 'USER_NOT_FOUND' | 'NOT_PRO' | 'LIMIT_REACHED';
class CreditError extends Error {
  constructor(public code: CreditErrorCode) { super(code); }
}

function initFirebase() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Missing Firebase env vars.`);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getUid(req: VercelRequest): Promise<string> {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('MISSING_TOKEN');
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

function signToken(uid: string, isBonus: boolean): string {
  const secret = process.env.NONCE_SECRET ?? 'fallback-secret-change-in-prod';
  const payload = `${uid}:${isBonus ? '1' : '0'}:${Date.now()}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

async function consumeCredit(uid: string, monthKey: string): Promise<boolean> {
  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  let isBonus = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new CreditError('USER_NOT_FOUND');

    const data = snap.data()!;
    const plan: string = data.plan ?? 'free';
    const isPaidPlan = ['basic', 'standard', 'premium', 'forever'].includes(plan);
    const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
    if (bonus > 0 && !isPaidPlan) {
      tx.set(userRef, { bonusAnalyses: bonus - 1 }, { merge: true });
      isBonus = true;
      return;
    }

    const userEmail: string = data.email ?? '';
    if (userEmail) {
      const centersSnap = await db.collection('learningCenters')
        .where('status', '==', 'active')
        .get();

      for (const centerDoc of centersSnap.docs) {
        const centerData = centerDoc.data();
        if (centerData.expiresAt && new Date(centerData.expiresAt) < new Date()) continue;

        const studentSnap = await centerDoc.ref.collection('students')
          .where('email', '==', userEmail)
          .limit(1)
          .get();

        if (!studentSnap.empty) {
          const usage = data.usage ?? {};
          const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
          if (used >= CENTER_MONTHLY_LIMIT) throw new CreditError('LIMIT_REACHED');
          tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
          return;
        }
      }
    }

    const planLimits: Record<string, number> = { forever: 9999, premium: 30, standard: 12, basic: 5 };
    const monthlyLimit = planLimits[data.plan as string];
    if (!monthlyLimit) throw new CreditError('NOT_PRO');

    const usage = data.usage ?? {};
    const used = usage.monthKey === monthKey ? (usage.count ?? 0) : 0;
    if (used >= monthlyLimit) throw new CreditError('LIMIT_REACHED');

    tx.set(userRef, { usage: { monthKey, count: used + 1 } }, { merge: true });
  });

  return isBonus;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { initFirebase(); } catch (e: unknown) {
    return res.status(500).json({ error: `Firebase init failed: ${(e as Error).message}` });
  }

  let uid: string;
  try { uid = await getUid(req); } catch {
    return res.status(401).json({ error: 'Invalid or missing auth token. Please sign in again.' });
  }

  const monthKey = currentMonthKey();
  let isBonus = false;

  try {
    isBonus = await consumeCredit(uid, monthKey);
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      if (e.code === 'NOT_PRO') return res.status(403).json({ error: 'AI feedback requires a paid plan (Basic, Standard, Premium, or Lifetime).' });
      if (e.code === 'LIMIT_REACHED') return res.status(429).json({ error: 'Monthly analysis limit reached. Quota resets next month.' });
      if (e.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User profile not found.' });
    }
    return res.status(500).json({ error: 'Usage tracking error. Please try again.' });
  }

  const token = signToken(uid, isBonus);
  return res.status(200).json({ token, isBonus, uid, monthKey });
}

export { signToken, currentMonthKey };
export type { CreditErrorCode };
