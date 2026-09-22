import type { UserRow } from "./types";

const DAY = 86_400_000;

export function formatDate(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(date?: Date | string | null): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return rtf.format(-Math.max(mins, 0), "minute");
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return rtf.format(-hrs, "hour");
  const days = Math.round(hrs / 24);
  if (days < 7) return rtf.format(-days, "day");
  return formatDate(d) ?? "";
}

/** Whole days from today to the date (negative when in the past). */
export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / DAY);
}

export function inDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const uzs = (n: number) => `${n.toLocaleString("en-US")} UZS`;

export const todayKey = () => new Date().toISOString().slice(0, 10);

// ── Plans ────────────────────────────────────────────────────────────────────
export type PlanId = "free" | "basic" | "standard" | "premium" | "forever";

export const PLANS: { id: PlanId; label: string; price?: string }[] = [
  { id: "free", label: "Free" },
  { id: "basic", label: "Basic", price: "19,000 UZS" },
  { id: "standard", label: "Standard", price: "29,000 UZS" },
  { id: "premium", label: "Premium", price: "49,000 UZS" },
  { id: "forever", label: "Lifetime" },
];

export function planOf(u: Pick<UserRow, "plan" | "subscription">): PlanId {
  if (u.subscription === "forever" || u.plan === "forever") return "forever";
  if (u.plan === "premium" || u.plan === "standard" || u.plan === "basic") return u.plan;
  return "free";
}

export function planLabel(u: Pick<UserRow, "plan" | "subscription">): string {
  // Learning-center students carry the legacy "pro" plan.
  if (u.plan === "pro") return "Center";
  return PLANS.find((p) => p.id === planOf(u))!.label;
}

// Plan tiers never use the state colors (emerald, amber, red).
export function planBadge(u: Pick<UserRow, "plan" | "subscription">): "purple" | "info" | "secondary" | "outline" {
  if (u.plan === "pro") return "outline";
  const p = planOf(u);
  if (p === "forever") return "purple";
  if (p === "premium") return "purple";
  if (p === "basic" || p === "standard") return "info";
  return "secondary";
}

export function isPaying(u: UserRow): boolean {
  return planOf(u) !== "free";
}

export function isExpiredPaid(u: UserRow): boolean {
  const p = planOf(u);
  return (p === "basic" || p === "standard" || p === "premium") && !!u.expiresAt && new Date(u.expiresAt) < new Date();
}

export function planStatus(u: UserRow): string {
  const p = planOf(u);
  if (u.plan === "pro") return "Learning center student";
  if (p === "forever") return "Lifetime access, never expires";
  if (p !== "free" && u.expiresAt) {
    return isExpiredPaid(u) ? `${planLabel(u)} plan expired on ${formatDate(u.expiresAt)}` : `${planLabel(u)} plan until ${formatDate(u.expiresAt)}`;
  }
  return "No active plan";
}

export function joinedToday(u: UserRow): boolean {
  return u.createdAt?.slice(0, 10) === todayKey();
}

// ── Activity ─────────────────────────────────────────────────────────────────
// The last time a person opened the site, stamped by api/seen.ts. Accounts that
// have not been back since that was added fall back to their newest essay
// check — see loadUsers() in AdminPage.tsx.

/** "Active 5 minutes ago", or a plain date once it is over a week old. */
export function lastActiveLabel(u: Pick<UserRow, "lastActiveAt">): string {
  const ago = timeAgo(u.lastActiveAt);
  if (!ago) return "Not active yet";
  return Date.now() - new Date(u.lastActiveAt!).getTime() < 7 * DAY ? `Active ${ago}` : `Active on ${ago}`;
}
