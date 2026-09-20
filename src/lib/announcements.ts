import { useSyncExternalStore } from "react";
import { Gift, Lightbulb, Megaphone, Rocket, Wrench, type LucideIcon } from "lucide-react";
import { getActiveAnnouncements, type Announcement, type AnnouncementCategory } from "@/firebase/firestore";

// Announcements the admin posts reach students two ways: a corner card that
// appears until it's dismissed, and the notification bell, where they stay
// for later. Both read the same list (fetched once per visit) and the same
// record of what this browser has already read.

export const ANNOUNCEMENT_CATEGORIES: Record<AnnouncementCategory, { label: string; icon: LucideIcon; tint: string }> = {
  announcement: {
    label: "Announcement",
    icon: Megaphone,
    tint: "bg-slate-100 text-slate-700 dark:bg-neutral-900 dark:text-neutral-200",
  },
  update: {
    label: "Update",
    icon: Rocket,
    tint: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  },
  tip: {
    label: "Tip",
    icon: Lightbulb,
    tint: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
  },
  // Gold is the site's upsell color.
  offer: {
    label: "Offer",
    icon: Gift,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    tint: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
};

export const categoryOf = (a: Pick<Announcement, "category">) =>
  ANNOUNCEMENT_CATEGORIES[a.category] ?? ANNOUNCEMENT_CATEGORIES.announcement;

const SITE_HOSTS = new Set(["writeready.uz", "www.writeready.uz"]);

/**
 * The in-app path for a link to this site, whether written as "/account" or
 * as a full writeready.uz address, so it opens in the same tab. Null for
 * links to other websites.
 */
export function sitePath(link: string): string | null {
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  try {
    const url = new URL(link);
    if (SITE_HOSTS.has(url.hostname) || url.host === window.location.host) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Not a full address.
  }
  return null;
}

/** Blank lines in the admin's text separate paragraphs. */
export const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// ── The list, fetched once per visit ────────────────────────────────────────

let request: Promise<Announcement[]> | null = null;

export function loadAnnouncements(): Promise<Announcement[]> {
  request ??= getActiveAnnouncements().catch((e) => {
    request = null; // let the next page try again
    throw e;
  });
  return request;
}

// ── What this browser has read ──────────────────────────────────────────────

const STORAGE_KEY = "announcements_seen";
const KEEP = 100;

function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let seen = new Set(readSeen());
const listeners = new Set<() => void>();

export function markAnnouncementsSeen(ids: string[]) {
  const fresh = ids.filter((id) => !seen.has(id));
  if (!fresh.length) return;
  seen = new Set([...seen, ...fresh]);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-KEEP)));
  } catch {
    // Storage blocked: still counts as read until the page reloads.
  }
  listeners.forEach((l) => l());
}

const onStorage = (e: StorageEvent) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  seen = new Set(readSeen());
  listeners.forEach((l) => l());
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Ids of the announcements this browser has read or dismissed. */
export const useSeenAnnouncements = () => useSyncExternalStore(subscribe, () => seen);
