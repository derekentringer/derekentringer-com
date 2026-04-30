/** Modern-chat-style timestamp ladder used by the AI Assistant
 *  panel. Mirrors the format used on ns-web and ns-mobile so
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

  const time = formatTime(then);
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

function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}
