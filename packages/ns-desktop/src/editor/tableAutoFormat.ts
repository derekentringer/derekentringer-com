/**
 * CodeMirror extension that auto-formats table column spacing when the
 * cursor leaves a table. Uses the Lezer markdown parse tree to detect
 * table boundaries and formatTableAtLine from tableMarkdown.ts to
 * rewrite the source with padded columns.
 */
import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { formatTableAtLine } from "../lib/tableMarkdown.ts";

function findTableAt(view: EditorView, pos: number): { from: number; to: number } | null {
  const tree = syntaxTree(view.state);
  let result: { from: number; to: number } | null = null;
  tree.iterate({
    from: pos, to: pos,
    enter: (node) => {
      if (node.type.name === "Table") {
        result = { from: node.from, to: node.to };
        return false;
      }
    },
  });
  return result;
}

class TableAutoFormatPlugin {
  prevTableRange: { from: number; to: number } | null = null;

  constructor(view: EditorView) {
    this.prevTableRange = findTableAt(view, view.state.selection.main.head);
  }

  update(update: ViewUpdate) {
    if (update.selectionSet || update.docChanged) {
      const view = update.view;
      const cursorPos = view.state.selection.main.head;
      const currentTable = findTableAt(view, cursorPos);

      if (
        this.prevTableRange &&
        !update.docChanged &&
        (!currentTable || currentTable.from !== this.prevTableRange.from)
      ) {
        const oldRange = this.prevTableRange;
        queueMicrotask(() => {
          const doc = view.state.doc.toString();
          const startLine = view.state.doc.lineAt(oldRange.from).number - 1;
          const changes = formatTableAtLine(doc, startLine);
          if (changes.length > 0) {
            view.dispatch({ changes });
          }
        });
      }

      this.prevTableRange = currentTable;
    }
  }
}

export function tableAutoFormat(): Extension {
  return ViewPlugin.fromClass(TableAutoFormatPlugin);
}
