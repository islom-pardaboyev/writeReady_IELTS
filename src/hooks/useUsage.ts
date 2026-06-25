import { useState, useEffect } from 'react';
import { getUsage } from '../firebase/firestore';
import type { UsageRecord } from '../types';

export function useUsage(uid: string | null) {
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const u = await getUsage(uid);
      setUsage(u ?? { uid, yearMonth: '', count: 0, limit: 12, updatedAt: new Date() });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [uid]);

  return { usage, loading, refresh };
}
