// Phase E.3 — append shared content to an existing note.
//
// Format mirrors what the parity plan called for: a horizontal
// rule separator, an italic "Clipped <local timestamp>" line,
// then the shared text. Reopened on web/desktop the markdown
// renders identically since the separator and italic line are
// standard markdown.
//
// Trailing whitespace on the existing content is trimmed before
// the separator is added so repeated appends don't stack blank
// lines forever.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Format a Date as `Month D, YYYY at H:MM AM/PM` in the device's
 * local timezone. Human-readable rather than ISO so an old appended
 * block still reads naturally when revisited months later.
 */
export function formatShareTimestamp(d: Date): string {
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${month} ${day}, ${year} at ${hour12}:${pad2(minutes)} ${period}`;
}

/**
 * Append shared text to an existing note's content with a
 * markdown separator + italic timestamp line. Returns the new
 * content; never mutates the input.
 *
 *   Hello world.
 *
 *   ---
 *
 *   *Clipped May 8, 2026 at 9:14 AM*
 *
 *   <shared text>
 *
 * Empty existing content (a brand-new untitled note) skips the
 * separator and just sets the share as the body — no need for a
 * leading horizontal rule on what's effectively a fresh page.
 */
export function appendShareContent(
  existing: string,
  shared: string,
  now: Date,
): string {
  const stamp = formatShareTimestamp(now);
  const trimmedShared = shared.trim();
  if (existing.trim().length === 0) {
    return `*Clipped ${stamp}*\n\n${trimmedShared}`;
  }
  const trimmedExisting = existing.replace(/\s+$/, "");
  return `${trimmedExisting}\n\n---\n\n*Clipped ${stamp}*\n\n${trimmedShared}`;
}
