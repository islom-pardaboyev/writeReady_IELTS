import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { db } from '../firebase/config';

export type FeatureFlagKey = 'humanCheck' | 'showTelegramBot';

export async function getFeatureFlag(key: FeatureFlagKey, dbInstance: Firestore = db): Promise<boolean> {
  const snap = await getDoc(doc(dbInstance, 'config', 'featureFlags'));
  if (!snap.exists()) return false;
  return snap.data()[key] === true;
}

export async function setFeatureFlag(key: FeatureFlagKey, value: boolean, dbInstance: Firestore = db): Promise<void> {
  await setDoc(doc(dbInstance, 'config', 'featureFlags'), { [key]: value }, { merge: true });
}

const DEFAULT_HUMAN_CHECK_PRICE_UZS = 20000;

export async function getHumanCheckPrice(dbInstance: Firestore = db): Promise<number> {
  const snap = await getDoc(doc(dbInstance, 'config', 'featureFlags'));
  const price = snap.exists() ? snap.data().humanCheckPriceUZS : undefined;
  return typeof price === 'number' && price > 0 ? price : DEFAULT_HUMAN_CHECK_PRICE_UZS;
}

export async function setHumanCheckPrice(priceUZS: number, dbInstance: Firestore = db): Promise<void> {
  await setDoc(doc(dbInstance, 'config', 'featureFlags'), { humanCheckPriceUZS: priceUZS }, { merge: true });
}

const DEFAULT_PLATFORM_FEE_UZS = 5000;

// The platform (admin) keeps this fee per checked review; the teacher earns the rest.
export async function getHumanCheckPlatformFee(dbInstance: Firestore = db): Promise<number> {
  const snap = await getDoc(doc(dbInstance, 'config', 'featureFlags'));
  const fee = snap.exists() ? snap.data().humanCheckPlatformFeeUZS : undefined;
  return typeof fee === 'number' && fee >= 0 ? fee : DEFAULT_PLATFORM_FEE_UZS;
}

export async function setHumanCheckPlatformFee(feeUZS: number, dbInstance: Firestore = db): Promise<void> {
  await setDoc(doc(dbInstance, 'config', 'featureFlags'), { humanCheckPlatformFeeUZS: feeUZS }, { merge: true });
}

// Site-wide maintenance flag. Reads/writes go through api/maintenance.ts
// (Admin SDK) rather than the Firestore client SDK directly, so an
// anonymous visitor on the public site can check status without needing a
// Firestore rule that opens `config/featureFlags` to public reads — every
// other flag on that doc is only ever read by logged-in students or admins.
export type MaintenanceUnit = 'hours' | 'days' | 'months';

export interface MaintenanceStatus {
  enabled: boolean;
  startedAt: number | null; // epoch ms
  endsAt: number | null; // epoch ms; planned reopening, shown to visitors as a countdown
  /** Admin -> Telegram bot: show the student bot on the site. Off until the admin turns it on. */
  showTelegramBot?: boolean;
}

export type MaintenanceUpdate =
  | { enabled: false }
  | { enabled: true; amount: number; unit: MaintenanceUnit };

const MAINTENANCE_OFF: MaintenanceStatus = { enabled: false, startedAt: null, endsAt: null, showTelegramBot: false };

/**
 * The site gate fails open (treats errors as "off"); pass `strict` where a
 * wrong "off" would mislead, e.g. the admin overview, to get the error instead.
 */
export async function getMaintenanceStatus({ fresh = false, strict = false } = {}): Promise<MaintenanceStatus> {
  try {
    // The CDN caches this response for a few seconds; a unique query string skips that cache.
    const res = await fetch(fresh ? `/api/maintenance?fresh=${Date.now()}` : '/api/maintenance');
    if (!res.ok) throw new Error(`Maintenance status request failed (${res.status})`);
    return await res.json();
  } catch (e) {
    if (strict) throw e;
    return MAINTENANCE_OFF;
  }
}

let siteStatus: Promise<MaintenanceStatus> | null = null;

/**
 * The status every visitor asks for once when the site opens (MaintenanceGate),
 * shared with everything else that needs it, so it is one request a visit.
 */
export function loadSiteStatus(): Promise<MaintenanceStatus> {
  if (!siteStatus) siteStatus = getMaintenanceStatus();
  return siteStatus;
}

/**
 * Whether the site shows the Telegram bot (the links to it and the dashboard
 * card). Admin -> Telegram bot turns it on; until then, and if the status
 * cannot be read, it stays hidden. `?preview=telegramBot` in the address
 * shows it anyway, to check before turning it on.
 */
export function useShowTelegramBot(): boolean {
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'telegramBot';
  const [show, setShow] = useState(preview);
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    loadSiteStatus().then((status) => {
      if (!cancelled) setShow(status.showTelegramBot === true);
    });
    return () => { cancelled = true; };
  }, [preview]);
  return show;
}

export async function updateMaintenance(update: MaintenanceUpdate, idToken: string): Promise<MaintenanceStatus> {
  const res = await fetch('/api/maintenance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(update),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Could not update maintenance mode.');
  return data;
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
