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

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setUsage({ uid, yearMonth, count: 0, limit: 12, updatedAt: new Date() });
        return;
      }
      const usage = snap.data()?.usage;
      const count = usage?.monthKey === yearMonth ? (usage?.count ?? 0) : 0;
      setUsage({ uid, yearMonth, count, limit: 12, updatedAt: new Date() });
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { usage, loading };
}
