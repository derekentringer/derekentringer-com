export function formatCreatedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatModifiedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/** Verbose relative-time ladder used by the version-history list.
 *  Mirrors the format used on ns-web and ns-desktop's version
 *  history so the same row reads the same on every platform. Goes
 *  down to per-minute precision and never falls back to a raw
 *  date — older versions roll up into weeks, months, then years. */
export function relativeTimeVerbose(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 min ago" : `${minutes} mins ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hr ago" : `${hours} hrs ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? "1 day ago" : `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} wks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mos ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? "1 yr ago" : `${years} yrs ago`;
}

/** Modern-chat-style timestamp ladder used by the AI Assistant
 *  screen. Mirrors the format used on ns-web and ns-desktop so
 *  the same message renders identically across platforms.
 *
 *  Ladder:
 *  - <60s         → "Just now"
 *  - 1–59 min     → "1min ago" / "Nmins ago"
 *  - Today, ≥1h   → "4:15pm"
 *  - Yesterday    → "Yesterday 4:15pm"
 *  - Same year    → "04/29 at 1:30pm"
 *  - Older years  → "04/29/24 at 1:30pm"
 */
export function formatChatTimestamp(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 60_000) return "Just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return minutes === 1 ? "1min ago" : `${minutes}mins ago`;

  const time = formatChatTime(then);
  if (sameCalendarDay(then, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameCalendarDay(then, yesterday)) return `Yesterday ${time}`;

  const month = String(then.getMonth() + 1).padStart(2, "0");
  const day = String(then.getDate()).padStart(2, "0");
  if (then.getFullYear() === now.getFullYear()) {
    return `${month}/${day} at ${time}`;
  }
  const yy = String(then.getFullYear()).slice(-2);
  return `${month}/${day}/${yy} at ${time}`;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatChatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}
