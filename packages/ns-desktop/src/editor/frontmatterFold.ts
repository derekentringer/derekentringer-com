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
 * Build line decorations that add a CSS class to frontmatter lines.
 * The class hides the lines via CSS (display: none) rather than using
 * Decoration.replace, which avoids RangeErrors when the document changes.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  if (doc.length === 0) return Decoration.none;

  const text = doc.sliceString(0, Math.min(doc.length, 5000));
  const match = text.match(FRONTMATTER_REGEX);
  if (!match) return Decoration.none;

  const fmEnd = match[0].length;
  const decos: Range<Decoration>[] = [];
  const lineDeco = Decoration.line({ class: "cm-frontmatter-hidden" });

  // Add line decoration to each line within the frontmatter block
  for (let pos = 0; pos < fmEnd && pos < doc.length; ) {
    const line = doc.lineAt(pos);
    decos.push(lineDeco.range(line.from));
    pos = line.to + 1;
  }

  return Decoration.set(decos);
}

/** CSS theme that hides lines with the frontmatter class */
const frontmatterTheme = EditorView.baseTheme({
  ".cm-frontmatter-hidden": {
    display: "none !important",
  },
});

const frontmatterFoldPlugin = ViewPlugin.fromClass(
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
 * Extension that hides the frontmatter block from the editor.
 * Uses CSS display:none on frontmatter lines (no Decoration.replace).
 * Pass this to a Compartment:
 * - Panel mode: compartment.of(hideFrontmatter())
 * - Source mode: compartment.of([])
 */
export function hideFrontmatter(): (typeof frontmatterFoldPlugin | typeof frontmatterTheme)[] {
  return [frontmatterFoldPlugin, frontmatterTheme];
}
