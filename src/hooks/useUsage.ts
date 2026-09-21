import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { effectivePlan, monthlyLimitFor } from '../lib/plans';
import type { UsageRecord } from '../types';

export function useUsage(uid: string | null) {
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const yearMonth = new Date().toISOString().slice(0, 7);

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setUsage({ uid, yearMonth, count: 0, limit: 0, updatedAt: new Date() });
        return;
      }
      const data = snap.data();
      const usage = data?.usage;
      const count = usage?.monthKey === yearMonth ? (usage?.count ?? 0) : 0;
      // The same plan rules the server applies in api/pre-check.ts, so the
      // number on screen matches the number the student actually gets. A
      // learning-center student carries their center's plan and end date.
      const limit = monthlyLimitFor(effectivePlan(data));
      setUsage({ uid, yearMonth, count, limit, updatedAt: new Date() });
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { usage, loading };
}
