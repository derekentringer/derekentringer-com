// String-level resolver for `[[wiki-link]]` syntax on mobile.
//
// Web/desktop use a remark plugin (`packages/ns-web/src/lib/
// remarkWikiLink.ts`) to walk the AST and rewrite wiki-link nodes
// into standard <a> elements with a `#wiki:<noteId>` URL scheme.
// Mobile renders via `react-native-markdown-display`, which has
// no remark pipeline — so we do the rewrite at the string level
// before handing content to the renderer.
//
// Behavior:
//   `[[Title]]`            → `[Title](#wiki:<noteId>)`
//   `[[Title|alias]]`      → `[alias](#wiki:<noteId>)`
//   `[[unresolved]]`       → unchanged (renders as plain text)
//
// The link is rendered via the markdown library's normal link
// styling (which on mobile uses `themeColors.primary`). Tapping
// it fires `onLinkPress` with the `#wiki:<noteId>` URL — the
// caller intercepts that scheme and navigates to NoteDetail.

const WIKI_RE = /\[\[([^\[\]]+?)\]\]/g;

export function resolveWikiLinks(
  content: string,
  titleToIdMap: Map<string, string>,
): string {
  return content.replace(WIKI_RE, (full, inner) => {
    const raw = String(inner).trim();
    // Pipe alias: [[Title|alias]] — link points to Title, label is alias.
    const pipeIdx = raw.indexOf("|");
    const title = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;
    const label = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw;
    const noteId = titleToIdMap.get(title.toLowerCase());
    if (!noteId) return full;
    return `[${label}](#wiki:${noteId})`;
  });
}

/** Parse a `#wiki:<noteId>` URL produced by `resolveWikiLinks`.
 *  Returns the noteId if the URL matches the scheme, else null. */
export function parseWikiLinkUrl(url: string): string | null {
  if (!url.startsWith("#wiki:")) return null;
  const id = url.slice("#wiki:".length).trim();
  return id.length > 0 ? id : null;
}
