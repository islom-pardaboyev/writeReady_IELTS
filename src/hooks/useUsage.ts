import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { monthlyLimitOf } from '../lib/plans';
import { nextRenewal, planCycle, usedThisCycle } from '@shared/planCycle';
import type { UsageRecord } from '../types';

export function useUsage(uid: string | null) {
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setUsage({ uid, cycleKey: planCycle(null).key, count: 0, limit: 0, renewsAt: null, updatedAt: new Date() });
        return;
      }
      const data = snap.data();
      // The same plan rules the server applies in api/pre-check.ts, so the
      // number on screen matches the number the student actually gets. A
      // learning-center student carries their center's plan and end date.
      // The month is the plan's own, from its end date (api/_lib/planCycle.ts).
      const count = usedThisCycle(data.usage, data.expiresAt);
      const limit = monthlyLimitOf(data);
      const renewsAt = limit > 0 ? nextRenewal(data.expiresAt) : null;
      setUsage({ uid, cycleKey: planCycle(data.expiresAt).key, count, limit, renewsAt, updatedAt: new Date() });
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { usage, loading };
}
