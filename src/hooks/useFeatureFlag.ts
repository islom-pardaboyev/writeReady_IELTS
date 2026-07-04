import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export type FeatureFlagKey = 'humanCheck';

export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  const snap = await getDoc(doc(db, 'config', 'featureFlags'));
  if (!snap.exists()) return false;
  return snap.data()[key] === true;
}

export async function setFeatureFlag(key: FeatureFlagKey, value: boolean): Promise<void> {
  await setDoc(doc(db, 'config', 'featureFlags'), { [key]: value }, { merge: true });
}

/**
 * Reads a feature flag once on mount. Defaults to `false` (hidden) until loaded or if unset.
 * A `?preview=<key>` URL param bypasses the Firestore flag so you can test an unreleased
 * feature on production without flipping it on for every user — share that link only with
 * whoever should see the preview.
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const previewOverride = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === key;
  const [enabled, setEnabled] = useState(previewOverride);

  useEffect(() => {
    if (previewOverride) return;
    let cancelled = false;
    getFeatureFlag(key).then((val) => {
      if (!cancelled) setEnabled(val);
    });
    return () => { cancelled = true; };
  }, [key, previewOverride]);

  return enabled;
}
