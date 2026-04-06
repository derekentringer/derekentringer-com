/**
 * Live Preview extension for CodeMirror 6.
 *
 * Obsidian-style inline markdown rendering: non-active lines show formatted
 * output (bold, italic, etc.) while the active line reveals raw markdown.
 *
 * Uses Decoration.replace() to hide syntax markers and Decoration.mark() to
 * style the visible text. atomicRanges prevents the cursor from entering
 * hidden ranges.
 */
import { type Extension, type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

// --- Mark decorations for styled text ---
const boldMark = Decoration.mark({ class: "cm-lp-bold" });
const italicMark = Decoration.mark({ class: "cm-lp-italic" });
const strikethroughMark = Decoration.mark({ class: "cm-lp-strikethrough" });
const inlineCodeMark = Decoration.mark({ class: "cm-lp-code" });

// Heading marks (h1–h6)
const headingMarks = [
  Decoration.mark({ class: "cm-lp-h1" }),
  Decoration.mark({ class: "cm-lp-h2" }),
  Decoration.mark({ class: "cm-lp-h3" }),
  Decoration.mark({ class: "cm-lp-h4" }),
  Decoration.mark({ class: "cm-lp-h5" }),
  Decoration.mark({ class: "cm-lp-h6" }),
];

// Horizontal rule mark
const hrMark = Decoration.mark({ class: "cm-lp-hr" });

// Blockquote marker hide + styling
const blockquoteMark = Decoration.mark({ class: "cm-lp-blockquote" });

// --- Helper: get line numbers where the cursor is (active lines) ---
function getActiveLines(view: EditorView): Set<number> {
  const active = new Set<number>();
  for (const range of view.state.selection.ranges) {
    // Include all lines in the selection range
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      active.add(n);
    }
  }
  return active;
}

// --- Helper: determine heading level from ATXHeading node ---
function getHeadingLevel(view: EditorView, from: number, to: number): number {
  const text = view.state.sliceDoc(from, to);
  const match = text.match(/^(#{1,6})\s/);
  return match ? match[1].length : 1;
}

// --- Helper: get the number of marker characters for emphasis ---
function getMarkerLen(nodeType: string, view: EditorView, from: number): number {
  if (nodeType === "StrongEmphasis") return 2; // ** or __
  if (nodeType === "Emphasis") return 1; // * or _
  // For Strikethrough, marker is ~~
  if (nodeType === "Strikethrough") return 2;
  return 1;
}

// --- Build decorations for a given view ---
function buildDecorations(view: EditorView): DecorationSet {
  const activeLines = getActiveLines(view);
  const decorations: Range<Decoration>[] = [];
  const { from: vpFrom, to: vpTo } = view.viewport;
  const tree = syntaxTree(view.state);

  tree.iterate({
    from: vpFrom,
    to: vpTo,
    enter: (node) => {
      const lineStart = view.state.doc.lineAt(node.from);
      const lineEnd = view.state.doc.lineAt(node.to);

      // Check if ANY line of this node is active
      for (let n = lineStart.number; n <= lineEnd.number; n++) {
        if (activeLines.has(n)) return;
      }

      switch (node.type.name) {
        case "Emphasis": {
          // Hide opening and closing * or _
          const markerLen = 1;
          if (node.to - node.from > markerLen * 2) {
            decorations.push(
              Decoration.replace({}).range(node.from, node.from + markerLen),
              italicMark.range(node.from + markerLen, node.to - markerLen),
              Decoration.replace({}).range(node.to - markerLen, node.to),
            );
          }
          return false; // don't recurse into children
        }

        case "StrongEmphasis": {
          // Hide opening and closing ** or __
          const markerLen = 2;
          if (node.to - node.from > markerLen * 2) {
            decorations.push(
              Decoration.replace({}).range(node.from, node.from + markerLen),
              boldMark.range(node.from + markerLen, node.to - markerLen),
              Decoration.replace({}).range(node.to - markerLen, node.to),
            );
          }
          return false;
        }

        case "Strikethrough": {
          // Hide opening and closing ~~
          const markerLen = 2;
          if (node.to - node.from > markerLen * 2) {
            decorations.push(
              Decoration.replace({}).range(node.from, node.from + markerLen),
              strikethroughMark.range(node.from + markerLen, node.to - markerLen),
              Decoration.replace({}).range(node.to - markerLen, node.to),
            );
          }
          return false;
        }

        case "InlineCode": {
          // Hide backticks, style the code text
          const text = view.state.sliceDoc(node.from, node.to);
          const backtickLen = text.startsWith("``") ? 2 : 1;
          if (node.to - node.from > backtickLen * 2) {
            decorations.push(
              Decoration.replace({}).range(node.from, node.from + backtickLen),
              inlineCodeMark.range(node.from + backtickLen, node.to - backtickLen),
              Decoration.replace({}).range(node.to - backtickLen, node.to),
            );
          }
          return false;
        }

        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6": {
          // Hide # markers and the trailing space
          const level = parseInt(node.type.name.replace("ATXHeading", ""), 10);
          const lineText = view.state.sliceDoc(node.from, node.to);
          const markerEnd = node.from + level; // position after ###
          // Find the space after the hashes
          const spaceEnd = lineText.charAt(level) === " " ? markerEnd + 1 : markerEnd;
          if (spaceEnd < node.to) {
            decorations.push(
              Decoration.replace({}).range(node.from, spaceEnd),
              headingMarks[level - 1].range(spaceEnd, node.to),
            );
          }
          return false;
        }

        case "HorizontalRule": {
          // Style the --- or *** or ___ as a subtle horizontal rule
          decorations.push(hrMark.range(node.from, node.to));
          return false;
        }

        case "QuoteMark": {
          // Hide the > marker in blockquotes
          const lineText = view.state.sliceDoc(node.from, node.to);
          decorations.push(Decoration.replace({}).range(node.from, node.to));
          return false;
        }
      }
    },
  });

  // Sort by position (required for RangeSet)
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return RangeSet.of(decorations);
}

// --- ViewPlugin ---
class LivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged
    ) {
      this.decorations = buildDecorations(update.view);
    }
  }
}

// --- Theme styles for live preview decorations ---
const livePreviewTheme = EditorView.baseTheme({
  ".cm-lp-bold": { fontWeight: "bold" },
  ".cm-lp-italic": { fontStyle: "italic" },
  ".cm-lp-strikethrough": { textDecoration: "line-through" },
  ".cm-lp-code": {
    fontFamily: "monospace",
    backgroundColor: "rgba(128, 128, 128, 0.15)",
    borderRadius: "3px",
    padding: "1px 4px",
  },
  ".cm-lp-h1": { fontSize: "1.8em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-lp-h2": { fontSize: "1.5em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-lp-h3": { fontSize: "1.3em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-lp-h4": { fontSize: "1.15em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-lp-h5": { fontSize: "1.05em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-lp-h6": { fontSize: "1em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-lp-hr": {
    display: "inline-block",
    width: "100%",
    textDecoration: "none",
    opacity: "0.3",
    letterSpacing: "0.5em",
  },
  ".cm-lp-blockquote": {
    borderLeft: "3px solid rgba(128, 128, 128, 0.4)",
    paddingLeft: "8px",
  },
});

// --- Exported extension factory ---
export function livePreview(): Extension {
  const plugin = ViewPlugin.fromClass(LivePreviewPlugin, {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none;
      }),
  });

  return [plugin, livePreviewTheme];
}
