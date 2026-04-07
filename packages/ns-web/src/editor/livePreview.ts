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
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

// --- Mark decorations for styled text ---
const boldMark = Decoration.mark({ class: "cm-lp-bold" });
const italicMark = Decoration.mark({ class: "cm-lp-italic" });
const strikethroughMark = Decoration.mark({ class: "cm-lp-strikethrough" });
const inlineCodeMark = Decoration.mark({ class: "cm-lp-code" });
const linkMark = Decoration.mark({ class: "cm-lp-link" });
const wikiLinkMark = Decoration.mark({ class: "cm-lp-wikilink" });

// Heading marks (h1–h6)
const headingMarks = [
  Decoration.mark({ class: "cm-lp-h1" }),
  Decoration.mark({ class: "cm-lp-h2" }),
  Decoration.mark({ class: "cm-lp-h3" }),
  Decoration.mark({ class: "cm-lp-h4" }),
  Decoration.mark({ class: "cm-lp-h5" }),
  Decoration.mark({ class: "cm-lp-h6" }),
];

// List bullet replacement widget
class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-lp-bullet";
    span.textContent = "•";
    return span;
  }
}

// Checkbox widget for task lists
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(other: CheckboxWidget) { return this.checked === other.checked; }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-lp-checkbox";
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
      // Find this widget's position and toggle the marker in source
      const pos = view.posAtDOM(input);
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const bracketIdx = text.indexOf("[ ]");
      const checkedIdx = text.indexOf("[x]");
      if (bracketIdx >= 0) {
        const from = line.from + bracketIdx;
        view.dispatch({ changes: { from, to: from + 3, insert: "[x]" } });
      } else if (checkedIdx >= 0) {
        const from = line.from + checkedIdx;
        view.dispatch({ changes: { from, to: from + 3, insert: "[ ]" } });
      }
    });
    return input;
  }
}

// Horizontal rule mark
const hrMark = Decoration.mark({ class: "cm-lp-hr" });


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

// --- Regex for wiki-links [[title]] ---
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

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

        case "Link": {
          // [text](url) → hide [ and ](url), style text as link
          // Find child positions from the parse tree
          const linkText = view.state.sliceDoc(node.from, node.to);
          // Check if this is actually a wiki-link (handled separately)
          if (linkText.startsWith("[[")) return false;
          const closeBracket = linkText.indexOf("](");
          if (closeBracket === -1) return false; // malformed
          const textStart = node.from + 1; // after [
          const textEnd = node.from + closeBracket;
          if (textEnd <= textStart) return false;
          decorations.push(
            Decoration.replace({}).range(node.from, textStart), // hide [
            linkMark.range(textStart, textEnd), // style text
            Decoration.replace({}).range(textEnd, node.to), // hide ](url)
          );
          return false;
        }

        case "Image": {
          // ![alt](url) → hide ![ and ](url), style alt as image label
          const imgText = view.state.sliceDoc(node.from, node.to);
          const closeBracket = imgText.indexOf("](");
          if (closeBracket === -1) return false;
          const altStart = node.from + 2; // after ![
          const altEnd = node.from + closeBracket;
          if (altEnd <= altStart) return false;
          decorations.push(
            Decoration.replace({}).range(node.from, altStart), // hide ![
            Decoration.mark({ class: "cm-lp-image" }).range(altStart, altEnd), // style alt
            Decoration.replace({}).range(altEnd, node.to), // hide ](url)
          );
          return false;
        }

        case "Table": {
          // Line-level styling: header bold + background, delimiter hidden, rows styled
          const tblCursor = node.node.cursor();
          if (tblCursor.firstChild()) {
            do {
              const childLine = view.state.doc.lineAt(tblCursor.from);
              // Skip active lines
              if (activeLines.has(childLine.number)) continue;

              if (tblCursor.type.name === "TableHeader") {
                decorations.push(Decoration.line({ class: "cm-lp-table-header" }).range(childLine.from));
              } else if (tblCursor.type.name === "TableDelimiter" && tblCursor.from === childLine.from) {
                // Delimiter row — replace content with thin line, keep the line visible for numbering
                if (childLine.to > childLine.from) {
                  decorations.push(Decoration.replace({}).range(childLine.from, childLine.to));
                }
                decorations.push(Decoration.line({ class: "cm-lp-table-delimiter" }).range(childLine.from));
              } else if (tblCursor.type.name === "TableRow") {
                decorations.push(Decoration.line({ class: "cm-lp-table-row" }).range(childLine.from));
              }
            } while (tblCursor.nextSibling());
          }
          return false;
        }

        case "FencedCode": {
          // Block-level reveal: if cursor is on ANY line of the block, show raw
          const blockStartLine = view.state.doc.lineAt(node.from).number;
          const blockEndLine = view.state.doc.lineAt(node.to).number;
          let cursorInBlock = false;
          for (let n = blockStartLine; n <= blockEndLine; n++) {
            if (activeLines.has(n)) { cursorInBlock = true; break; }
          }
          if (cursorInBlock) return false;

          // Find child nodes for fence markers and code content
          let openFenceEnd = node.from;
          let closeFenceStart = node.to;
          let codeStart = node.from;
          let codeEnd = node.to;
          let language = "";

          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.type.name === "CodeMark") {
                if (cursor.from === node.from) {
                  // Opening fence
                  openFenceEnd = cursor.to;
                } else {
                  // Closing fence
                  closeFenceStart = cursor.from;
                }
              } else if (cursor.type.name === "CodeInfo") {
                language = view.state.sliceDoc(cursor.from, cursor.to);
                openFenceEnd = cursor.to;
              } else if (cursor.type.name === "CodeText") {
                codeStart = cursor.from;
                codeEnd = cursor.to;
              }
            } while (cursor.nextSibling());
          }

          // Hide the opening fence line (``` + language) — replace content within line, collapse via CSS
          const openLine = view.state.doc.lineAt(node.from);
          if (openLine.to > openLine.from) {
            decorations.push(Decoration.replace({}).range(openLine.from, openLine.to));
          }
          decorations.push(Decoration.line({ class: "cm-lp-hidden-line" }).range(openLine.from));

          // Style each code content line with background
          const firstCodeLine = view.state.doc.lineAt(codeStart);
          const closeLine = view.state.doc.lineAt(closeFenceStart > node.from ? closeFenceStart : node.to);
          for (let n = firstCodeLine.number; n < closeLine.number; n++) {
            const line = view.state.doc.line(n);
            decorations.push(Decoration.line({ class: "cm-lp-codeblock-line" }).range(line.from));
          }

          // Add language label on the first code line
          if (language && firstCodeLine.number < closeLine.number) {
            decorations.push(Decoration.line({
              class: "cm-lp-codeblock-first",
              attributes: { "data-language": language },
            }).range(firstCodeLine.from));
          }

          // Hide the closing fence line — replace content within line, collapse via CSS
          if (closeFenceStart > node.from) {
            const closeLineObj = view.state.doc.lineAt(closeFenceStart);
            if (closeLineObj.to > closeLineObj.from) {
              decorations.push(Decoration.replace({}).range(closeLineObj.from, closeLineObj.to));
            }
            decorations.push(Decoration.line({ class: "cm-lp-hidden-line" }).range(closeLineObj.from));
          }

          return false; // don't recurse into children
        }

        case "HorizontalRule": {
          // Style the --- or *** or ___ as a subtle horizontal rule
          decorations.push(hrMark.range(node.from, node.to));
          return false;
        }

        case "QuoteMark": {
          // Hide the > marker and style the line as a blockquote
          const afterMark = node.to;
          const hideEnd = view.state.sliceDoc(afterMark, afterMark + 1) === " " ? afterMark + 1 : afterMark;
          decorations.push(Decoration.replace({}).range(node.from, hideEnd));
          const quoteLine = view.state.doc.lineAt(node.from);
          decorations.push(Decoration.line({ class: "cm-lp-blockquote-line" }).range(quoteLine.from));
          return false;
        }

        case "ListMark": {
          // Replace - or * bullets with • (skip if this is a task list item)
          const markText = view.state.sliceDoc(node.from, node.to);
          if (markText === "-" || markText === "*") {
            // Check if this list item has a TaskMarker sibling (don't replace bullet for tasks)
            const parent = node.node.parent;
            let isTask = false;
            if (parent) {
              const cursor = parent.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.type.name === "Task") { isTask = true; break; }
                } while (cursor.nextSibling());
              }
            }
            if (isTask) {
              // Hide the bullet mark + trailing space — checkbox widget replaces the visual
              const afterMark = node.to;
              const hideEnd = view.state.sliceDoc(afterMark, afterMark + 1) === " " ? afterMark + 1 : afterMark;
              decorations.push(Decoration.replace({}).range(node.from, hideEnd));
            } else {
              // Replace - or * with bullet dot
              decorations.push(
                Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to),
              );
            }
          }
          // Ordered list marks (1., 2., etc.) — leave as-is
          return false;
        }

        case "TaskMarker": {
          // Replace [ ] or [x] with a clickable checkbox widget
          const markerText = view.state.sliceDoc(node.from, node.to);
          const checked = markerText === "[x]" || markerText === "[X]";
          decorations.push(
            Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to),
          );
          return false;
        }
      }
    },
  });

  // Wiki-links [[title]] — not in Lezer tree, detect via regex
  for (let i = 1; i <= view.state.doc.lines; i++) {
    if (activeLines.has(i)) continue;
    const line = view.state.doc.line(i);
    if (line.from > vpTo || line.to < vpFrom) continue;
    WIKI_LINK_RE.lastIndex = 0;
    let match;
    while ((match = WIKI_LINK_RE.exec(line.text)) !== null) {
      const start = line.from + match.index;
      const end = start + match[0].length;
      const titleStart = start + 2; // after [[
      const titleEnd = end - 2; // before ]]
      if (titleEnd > titleStart) {
        decorations.push(
          Decoration.replace({}).range(start, titleStart), // hide [[
          wikiLinkMark.range(titleStart, titleEnd), // style title
          Decoration.replace({}).range(titleEnd, end), // hide ]]
        );
      }
    }
  }

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
  ".cm-lp-link": {
    color: "#58a6ff",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    cursor: "pointer",
  },
  ".cm-lp-wikilink": {
    color: "#d4e157",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: "2px",
    cursor: "pointer",
  },
  ".cm-lp-image": {
    color: "#58a6ff",
    fontStyle: "italic",
    "&::before": { content: "'\\1F5BC\\FE0E '", fontSize: "0.9em" },
  },
  ".cm-lp-bullet": {
    color: "rgba(128, 128, 128, 0.7)",
    fontSize: "1.1em",
    lineHeight: "1",
  },
  ".cm-lp-checkbox": {
    verticalAlign: "middle",
    marginRight: "4px",
    cursor: "pointer",
    accentColor: "var(--color-primary, #d4e157)",
  },
  ".cm-lp-hidden-line": {
    fontSize: "0",
    lineHeight: "0",
    height: "0",
    overflow: "hidden",
  },
  ".cm-lp-table-header": {
    fontWeight: "bold",
    backgroundColor: "var(--color-subtle, #1a1c24)",
    borderBottom: "2px solid var(--color-border, #1e2028)",
  },
  ".cm-lp-table-row": {
    backgroundColor: "var(--color-subtle, #1a1c24)",
    borderBottom: "1px solid var(--color-border, #1e2028)",
  },
  ".cm-lp-table-delimiter": {
    borderBottom: "1px solid var(--color-border, #1e2028)",
    height: "4px",
    lineHeight: "0",
    fontSize: "0",
  },
  ".cm-lp-codeblock-line": {
    backgroundColor: "var(--color-subtle, #1a1c24)",
    fontFamily: "monospace",
  },
  ".cm-lp-codeblock-first": {
    backgroundColor: "var(--color-subtle, #1a1c24)",
    fontFamily: "monospace",
    borderTop: "1px solid var(--color-border, #1e2028)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    "&::after": {
      content: "attr(data-language)",
      float: "right",
      fontSize: "0.75em",
      color: "var(--color-muted-foreground, #666)",
      opacity: "0.7",
    },
  },
  ".cm-lp-blockquote-line": {
    borderLeft: "3px solid var(--color-primary, #d4e157)",
    paddingLeft: "12px",
    color: "var(--color-muted, #999)",
    fontStyle: "italic",
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
