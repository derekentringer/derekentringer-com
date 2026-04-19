import {
  EditorView,
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";

const FRONTMATTER_REGEX = /^---[ \t]*\n[\s\S]*?\n?---[ \t]*\n?/;

/**
 * Build line decorations that style frontmatter lines with a code-like
 * appearance (subtle background, monospace font) when visible in source mode.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  if (doc.length === 0) return Decoration.none;

  const text = doc.sliceString(0, Math.min(doc.length, 5000));
  const match = text.match(FRONTMATTER_REGEX);
  if (!match) return Decoration.none;

  const fmEnd = match[0].length;
  const decos: Range<Decoration>[] = [];

  // Style the --- delimiters differently from the YAML content
  for (let pos = 0; pos < fmEnd && pos < doc.length; ) {
    const line = doc.lineAt(pos);
    const lineText = line.text.trim();
    const deco = lineText === "---"
      ? Decoration.line({ class: "cm-frontmatter-delimiter" })
      : Decoration.line({ class: "cm-frontmatter-field" });
    decos.push(deco.range(line.from));
    pos = line.to + 1;
  }

  return Decoration.set(decos);
}

/** CSS theme for frontmatter styling in source mode */
const frontmatterHighlightTheme = EditorView.baseTheme({
  ".cm-frontmatter-delimiter": {
    color: "var(--color-muted-foreground)",
    opacity: "0.5",
  },
  ".cm-frontmatter-field": {
    backgroundColor: "var(--color-muted-foreground, #888)08",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: "0.9em",
  },
});

const frontmatterHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Extension that styles frontmatter lines with a code-like appearance.
 * Used in source mode when the raw YAML is visible.
 */
export function highlightFrontmatter() {
  return [frontmatterHighlightPlugin, frontmatterHighlightTheme];
}
