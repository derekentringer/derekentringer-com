// Source-level helpers for interactive task checkboxes.
//
// `markTasks` runs in the render path (alongside stripFrontmatter
// and resolveWikiLinks) to rewrite each leading `[ ] ` / `[x] `
// task marker into a markdown link with a custom URL scheme:
//
//   `- [ ] foo`  →  `- [☐](#task-empty:0) foo`
//   `- [x] bar`  →  `- [☑](#task-done:1) bar`
//
// The `link` rule in markdownRules.ts detects the scheme and
// renders an inline tappable checkbox glyph. On tap, the screen
// intercepts via parseTaskUrl and calls `toggleTask` against the
// *original* unmodified note content (frontmatter + wiki-link
// syntax intact), then saves through the normal update path.
// markTasks is purely cosmetic for rendering; the canonical
// representation in the source remains the standard GFM
// `- [ ] ` / `- [x] ` form so it round-trips cleanly to web/desktop.

const TASK_RE = /^([ \t]*)([-*+][ \t]+)\[([ xX])\] /gm;
const TASK_TOGGLE_RE = /^([ \t]*)([-*+][ \t]+)\[([ xX])\]( )/gm;

/**
 * Replace each leading `[ ] ` / `[x] ` task marker with a markdown
 * link that carries the task index in its URL. The label is the
 * appropriate Unicode checkbox glyph; the URL scheme tells the
 * link rule how to render and how to dispatch on tap.
 */
export function markTasks(content: string): string {
  let index = 0;
  return content.replace(TASK_RE, (_full, indent, bullet, mark) => {
    const checked = mark === "x" || mark === "X";
    const scheme = checked ? "task-done" : "task-empty";
    const glyph = checked ? "☑" : "☐"; // ☑ / ☐
    const link = `[${glyph}](#${scheme}:${index}) `;
    index++;
    return `${indent}${bullet}${link}`;
  });
}

/**
 * Flip the checked state of the N-th task marker (zero-based) in
 * the given content. Returns the original content unchanged if
 * the index is out of range. Operates on the canonical GFM source
 * — call this against the *unmodified* note content, not the
 * markTasks-rewritten version.
 */
export function toggleTask(content: string, taskIndex: number): string {
  let i = 0;
  return content.replace(TASK_TOGGLE_RE, (full, indent, bullet, mark, sp) => {
    if (i++ !== taskIndex) return full;
    const checked = mark === "x" || mark === "X";
    const newMark = checked ? " " : "x";
    return `${indent}${bullet}[${newMark}]${sp}`;
  });
}

/** Parsed task URL: `#task-empty:N` or `#task-done:N`. */
export interface ParsedTaskUrl {
  taskIndex: number;
  /** Whether the *current* state in the source is checked. The tap
   *  handler should toggle to the opposite state. */
  checked: boolean;
}

/** Parse a task URL produced by `markTasks`. Returns null for any
 *  URL that doesn't match the scheme. */
export function parseTaskUrl(url: string): ParsedTaskUrl | null {
  const m = url.match(/^#task-(empty|done):(\d+)$/);
  if (!m) return null;
  return {
    checked: m[1] === "done",
    taskIndex: parseInt(m[2], 10),
  };
}
