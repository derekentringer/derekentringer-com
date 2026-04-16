import {
  EditorView,
  Decoration,
  ViewPlugin,
  type DecorationSet,
} from "@codemirror/view";

const FRONTMATTER_REGEX = /^---[ \t]*\n[\s\S]*?\n?---[ \t]*\n?/;

/**
 * CodeMirror ViewPlugin that hides the YAML frontmatter block at the top
 * of the document using Decoration.replace. The block is completely hidden
 * (no widget or placeholder) so the editor starts at the body content.
 *
 * Use inside a Compartment to toggle on/off at runtime.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const text = doc.sliceString(0, Math.min(doc.length, 5000));
  const match = text.match(FRONTMATTER_REGEX);
  if (!match) return Decoration.none;

  const from = 0;
  let to = match[0].length;
  // Clamp to doc length
  if (to > doc.length) to = doc.length;

  const deco = Decoration.replace({ block: true });
  return Decoration.set([deco.range(from, to)]);
}

const frontmatterFoldPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: { docChanged: boolean; view: EditorView }) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Extension that hides the frontmatter block from the editor.
 * Pass this to a Compartment:
 * - Panel mode: compartment.of(hideFrontmatter())
 * - Source mode: compartment.of([])
 */
export function hideFrontmatter(): typeof frontmatterFoldPlugin {
  return frontmatterFoldPlugin;
}
