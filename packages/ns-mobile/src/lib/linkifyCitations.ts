// Phase A.2 (mobile): citation tokenizer.
//
// Mirror of `linkifyCitations` from packages/ns-{web,desktop}/src/
// components/AIAssistantPanel.tsx, adapted for React Native:
// instead of emitting a markdown string with [N](cite:Title) links
// (which the web/desktop ReactMarkdown then parses), we emit a flat
// token stream that the mobile renderer maps directly to <Text>,
// inline title <Pressable>, and superscript marker <Pressable>
// nodes.
//
// References are detected two ways, whichever Claude emitted:
//   - explicit `[Note Title]` brackets (the convention asked for in
//     the system prompt)
//   - bare exact-title matches against the sources + noteCards pool
//     (Claude doesn't always follow the bracket instruction — bold
//     titles in listicles like /recent are common)
//
// Each referenced title gets ONE numeric marker at its first
// appearance; subsequent mentions stay as plain inline links.
// Numbering follows the order of first appearance in the text, which
// is also the order pills render under the message.

export type CitationToken =
  | { kind: "text"; text: string }
  | { kind: "title"; text: string; noteId: string; index: number }
  | { kind: "marker"; index: number; noteId: string; title: string };

export interface CitationSource {
  id: string;
  title: string;
}

const CITE_RE = /\[([^\]]+)\]/g;

/** Convert text + citation pool → flat token stream the renderer
 *  walks. Plain-text segments are coalesced; title/marker tokens
 *  carry the noteId for tap navigation. */
export function tokenizeCitations(
  text: string,
  sources: readonly CitationSource[] | undefined,
  noteCards: readonly CitationSource[] | undefined,
): CitationToken[] {
  // Dedup pool — sources first (Q&A citations), then noteCards (pills
  // from search/recent/favorites). Both are legitimate citation
  // targets.
  const pool: CitationSource[] = [];
  const seen = new Set<string>();
  for (const c of [...(sources ?? []), ...(noteCards ?? [])]) {
    if (c.title && !seen.has(c.title)) {
      seen.add(c.title);
      pool.push(c);
    }
  }
  if (pool.length === 0) {
    // No pool → unwrap any unknown `[Title]` brackets (often the AI
    // bracketed a title that didn't get a corresponding noteCard,
    // e.g. delete confirmations don't emit pills). Keep the inner
    // text so the title still reads naturally instead of being
    // wiped to nothing.
    const stripped = text
      .replace(/\[([^\]]+)\](?!\()/g, "$1")
      .replace(/ {2,}/g, " ")
      .trim();
    return stripped.length > 0 ? [{ kind: "text", text: stripped }] : [];
  }

  type Ref = {
    start: number;
    end: number;
    title: string;
    kind: "bracket" | "bare";
  };
  const refs: Ref[] = [];
  const titleToId = new Map<string, string>();
  for (const c of pool) titleToId.set(c.title, c.id);

  // Pass 1: explicit [Title] markers.
  CITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(text)) !== null) {
    if (titleToId.has(m[1])) {
      refs.push({
        start: m.index,
        end: m.index + m[0].length,
        title: m[1],
        kind: "bracket",
      });
    }
  }

  // Pass 2: bare exact-title matches. Mask out [...] segments first
  // so we don't double-count or match inside a markdown link label.
  const masked = text.replace(/\[[^\]]*\]/g, (s) => " ".repeat(s.length));
  // Longest-first so "Daily Stand-up Meeting" wins over "Meeting".
  const titles = pool.map((p) => p.title).sort((a, b) => b.length - a.length);
  const escaped = titles.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  if (escaped.length > 0) {
    const bareRe = new RegExp(`(?<!\\w)(${escaped.join("|")})(?!\\w)`, "g");
    let bm: RegExpExecArray | null;
    while ((bm = bareRe.exec(masked)) !== null) {
      refs.push({
        start: bm.index,
        end: bm.index + bm[0].length,
        title: bm[1],
        kind: "bare",
      });
    }
  }

  refs.sort((a, b) => a.start - b.start);

  // Number titles by first appearance.
  const titleToIndex = new Map<string, number>();
  let nextIdx = 1;
  for (const r of refs) {
    if (!titleToIndex.has(r.title)) titleToIndex.set(r.title, nextIdx++);
  }

  // No matches → unwrap any remaining `[Title]` brackets (keep
  // inner text) and return.
  if (titleToIndex.size === 0) {
    const stripped = text
      .replace(/\[([^\]]+)\](?!\()/g, "$1")
      .replace(/ {2,}/g, " ")
      .trim();
    return stripped.length > 0 ? [{ kind: "text", text: stripped }] : [];
  }

  // Walk the text, emitting alternating text + ref tokens. First
  // reference per title gets the marker token; later references just
  // get the inline title link.
  const tokens: CitationToken[] = [];
  const cited = new Set<string>();
  let cursor = 0;

  const pushText = (s: string) => {
    if (!s) return;
    // Unwrap any leftover `[Title]` brackets that didn't resolve to
    // a citation (the AI sometimes brackets titles that aren't in
    // the pool, e.g. delete confirmations don't emit noteCards) —
    // keep the inner text so the prose reads naturally. The
    // `(?!\()` lookahead leaves real markdown links untouched.
    const cleaned = s
      .replace(/\[([^\]]+)\](?!\()/g, "$1")
      .replace(/ {2,}/g, " ");
    if (cleaned.length === 0) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === "text") {
      // Coalesce adjacent text tokens.
      tokens[tokens.length - 1] = { kind: "text", text: last.text + cleaned };
    } else {
      tokens.push({ kind: "text", text: cleaned });
    }
  };

  for (const r of refs) {
    pushText(text.slice(cursor, r.start));
    const idx = titleToIndex.get(r.title)!;
    const noteId = titleToId.get(r.title)!;
    const isFirst = !cited.has(r.title);
    cited.add(r.title);
    tokens.push({ kind: "title", text: r.title, noteId, index: idx });
    if (isFirst) {
      tokens.push({ kind: "marker", index: idx, noteId, title: r.title });
    }
    cursor = r.end;
  }
  pushText(text.slice(cursor));

  // Trim leading/trailing whitespace on the boundary text tokens.
  if (tokens.length > 0 && tokens[0].kind === "text") {
    const first = tokens[0];
    tokens[0] = { kind: "text", text: first.text.replace(/^\s+/, "") };
    if (tokens[0].kind === "text" && tokens[0].text.length === 0) {
      tokens.shift();
    }
  }
  if (tokens.length > 0 && tokens[tokens.length - 1].kind === "text") {
    const last = tokens[tokens.length - 1];
    if (last.kind === "text") {
      tokens[tokens.length - 1] = {
        kind: "text",
        text: last.text.replace(/\s+$/, ""),
      };
      const trailing = tokens[tokens.length - 1];
      if (trailing.kind === "text" && trailing.text.length === 0) {
        tokens.pop();
      }
    }
  }

  return tokens;
}
