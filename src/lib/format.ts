import type { Messages } from "@/i18n";

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "today", "yesterday", "5 days ago", then a plain date after two weeks. */
export function timeAgo(iso: string, m: Messages, now: number = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY);
  if (days <= 0) return m.common.today;
  if (days === 1) return m.common.yesterday;
  if (days <= 14) return m.common.daysAgo(days);
  return formatDate(iso);
}

export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `0x12ab…90ef` — enough to compare by eye; the full value is always available. */
export function shortDigest(digest: string): string {
  return `${digest.slice(0, 10)}…${digest.slice(-8)}`;
}

export const REFERENCE_PATTERN = /^BB-\d{4}-\d{6}$/;
