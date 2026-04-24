import {
  EditorView,
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  gutter,
  GutterMarker,
} from "@codemirror/view";
import { type Range, type Extension, StateField } from "@codemirror/state";

const FRONTMATTER_REGEX = /^---[ \t]*\n[\s\S]*?\n?---[ \t]*\n?/;

/**
 * Count the number of lines in the frontmatter block.
 */
function countFrontmatterLines(doc: { sliceString: (from: number, to: number) => string; length: number }): number {
  const text = doc.sliceString(0, Math.min(doc.length, 5000));
  const match = text.match(FRONTMATTER_REGEX);
  if (!match) return 0;
  // Count newlines in the matched frontmatter
  return (match[0].match(/\n/g) || []).length;
}

/**
 * StateField that tracks the number of hidden frontmatter lines.
 * Used by the custom gutter to offset line numbers.
 */
const frontmatterLineCount = StateField.define<number>({
  create(state) {
    return countFrontmatterLines(state.doc);
  },
  update(value, tr) {
    if (tr.docChanged) {
      return countFrontmatterLines(tr.newDoc);
    }
    return value;
  },
});

/**
 * Custom gutter marker that displays an offset line number.
 */
class OffsetLineNumber extends GutterMarker {
  constructor(readonly num: number) {
    super();
  }
  toDOM(): Text {
    return document.createTextNode(String(this.num));
  }
}

/**
 * Custom line number gutter that offsets numbers by the frontmatter line count.
 * Lines inside the frontmatter get no number (they're hidden).
 */
const offsetLineNumbers = gutter({
  class: "cm-lineNumbers",
  lineMarker(view, line) {
    const hiddenCount = view.state.field(frontmatterLineCount);
    const lineNum = view.state.doc.lineAt(line.from).number;
    // Lines within frontmatter: no marker (they're visually hidden)
    if (lineNum <= hiddenCount) return null;
    // Offset the line number
    return new OffsetLineNumber(lineNum - hiddenCount);
  },
  lineMarkerChange(update) {
    return update.docChanged;
  },
});

/**
 * Build line decorations that visually collapse frontmatter lines to zero
 * height. Uses CSS to hide lines while keeping CodeMirror's internal line
 * model intact (avoids RangeError from Decoration.replace).
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

  for (let pos = 0; pos < fmEnd && pos < doc.length; ) {
    const line = doc.lineAt(pos);
    decos.push(lineDeco.range(line.from));
    pos = line.to + 1;
  }

  return Decoration.set(decos);
}

/** CSS theme that collapses frontmatter lines to zero height */
const frontmatterTheme = EditorView.baseTheme({
  ".cm-frontmatter-hidden": {
    height: "0 !important",
    overflow: "hidden !important",
    padding: "0 !important",
    margin: "0 !important",
    lineHeight: "0 !important",
    fontSize: "0 !important",
    border: "none !important",
    visibility: "hidden",
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
 * Uses CSS to collapse lines to zero height (safe, no RangeError).
 *
 * Note: this does NOT include a line number gutter. If the caller
 * wants numbered lines alongside the hidden frontmatter, compose
 * `offsetLineNumbersExt()` separately so the "show line numbers"
 * toggle in the editor stays independent.
 */
export function hideFrontmatter(): Extension[] {
  return [
    frontmatterFoldPlugin,
    frontmatterTheme,
  ];
}

/**
 * Line number gutter for use alongside hideFrontmatter(). Numbers
 * start at 1 on the first visible (post-frontmatter) line; the
 * frontmatter lines get no marker. Only useful when
 * hideFrontmatter() is also active — otherwise use the stock
 * `lineNumbers()` extension from @codemirror/view.
 *
 * Bundles the `frontmatterLineCount` StateField its gutter reads
 * from, so the extension is self-sufficient and can be toggled on
 * / off independently of `hideFrontmatter()`. Without this the
 * gutter would silently fail to render when its StateField
 * dependency wasn't registered (e.g. during the brief window
 * between two reconfigure dispatches when the user toggles the
 * frontmatter panel mode back and forth).
 */
export function offsetLineNumbersExt(): Extension[] {
  return [frontmatterLineCount, offsetLineNumbers];
}
