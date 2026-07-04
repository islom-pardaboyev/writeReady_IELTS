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

const DEFAULT_HUMAN_CHECK_PRICE_UZS = 20000;

export async function getHumanCheckPrice(): Promise<number> {
  const snap = await getDoc(doc(db, 'config', 'featureFlags'));
  const price = snap.exists() ? snap.data().humanCheckPriceUZS : undefined;
  return typeof price === 'number' && price > 0 ? price : DEFAULT_HUMAN_CHECK_PRICE_UZS;
}

export async function setHumanCheckPrice(priceUZS: number): Promise<void> {
  await setDoc(doc(db, 'config', 'featureFlags'), { humanCheckPriceUZS: priceUZS }, { merge: true });
}

const DEFAULT_PLATFORM_FEE_UZS = 5000;

// The platform (admin) keeps this fee per checked review; the teacher earns the rest.
export async function getHumanCheckPlatformFee(): Promise<number> {
  const snap = await getDoc(doc(db, 'config', 'featureFlags'));
  const fee = snap.exists() ? snap.data().humanCheckPlatformFeeUZS : undefined;
  return typeof fee === 'number' && fee >= 0 ? fee : DEFAULT_PLATFORM_FEE_UZS;
}

export async function setHumanCheckPlatformFee(feeUZS: number): Promise<void> {
  await setDoc(doc(db, 'config', 'featureFlags'), { humanCheckPlatformFeeUZS: feeUZS }, { merge: true });
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
