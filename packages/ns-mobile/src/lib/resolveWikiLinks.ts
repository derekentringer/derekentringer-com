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
//   `[[unresolved]]`       → `[unresolved](#wiki-broken:<title>)`
//
// Unresolved links use a separate `#wiki-broken:` scheme so the
// renderer can style them differently (muted color + dashed
// underline, mirroring web's `.wiki-link-broken` span). Tapping
// fires `onLinkPress` — the caller distinguishes via
// `parseWikiLinkUrl` (resolved → navigate) vs
// `parseBrokenWikiLinkUrl` (broken → toast / no-op).

const WIKI_RE = /\[\[([^\[\]]+?)\]\]/g;

export function resolveWikiLinks(
  content: string,
  titleToIdMap: Map<string, string>,
): string {
  return content.replace(WIKI_RE, (_full, inner) => {
    const raw = String(inner).trim();
    // Pipe alias: [[Title|alias]] — link points to Title, label is alias.
    const pipeIdx = raw.indexOf("|");
    const title = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;
    const label = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw;
    const noteId = titleToIdMap.get(title.toLowerCase());
    if (noteId) return `[${label}](#wiki:${noteId})`;
    // Unresolved: emit a broken-link form so the renderer can
    // style it. encodeURIComponent on the title avoids breaking
    // the markdown link URL syntax for titles with parens, etc.
    return `[${label}](#wiki-broken:${encodeURIComponent(title)})`;
  });
}

/** Parse a `#wiki:<noteId>` URL produced by `resolveWikiLinks`.
 *  Returns the noteId if the URL matches the scheme, else null. */
export function parseWikiLinkUrl(url: string): string | null {
  if (!url.startsWith("#wiki:")) return null;
  const id = url.slice("#wiki:".length).trim();
  return id.length > 0 ? id : null;
}

/** Parse a `#wiki-broken:<title>` URL produced by `resolveWikiLinks`.
 *  Returns the original (decoded) title if the URL matches the
 *  scheme, else null. */
export function parseBrokenWikiLinkUrl(url: string): string | null {
  if (!url.startsWith("#wiki-broken:")) return null;
  const encoded = url.slice("#wiki-broken:".length).trim();
  if (encoded.length === 0) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
