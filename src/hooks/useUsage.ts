import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { UsageRecord } from '../types';

export function useUsage(uid: string | null) {
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const yearMonth = new Date().toISOString().slice(0, 7);

    const planLimits: Record<string, number> = { forever: 9999, premium: 25, standard: 12, basic: 5 };

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setUsage({ uid, yearMonth, count: 0, limit: 0, updatedAt: new Date() });
        return;
      }
      const data = snap.data();
      const usage = data?.usage;
      const count = usage?.monthKey === yearMonth ? (usage?.count ?? 0) : 0;
      const plan: string = data?.plan ?? 'free';
      const expiresAt: string = data?.expiresAt ?? '';
      const isExpired = plan !== 'forever' && !!expiresAt && new Date(expiresAt) < new Date();
      const effectivePlan = isExpired ? 'free' : plan;
      const limit = planLimits[effectivePlan] ?? 0;
      setUsage({ uid, yearMonth, count, limit, updatedAt: new Date() });
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { usage, loading };
}
