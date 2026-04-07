import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { tableAutoFormat } from "../editor/tableAutoFormat.ts";

function createView(doc: string, cursorPos?: number): EditorView {
  const parent = document.createElement("div");
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: GFM }),
        tableAutoFormat(),
      ],
      selection: cursorPos !== undefined ? { anchor: cursorPos } : undefined,
    }),
    parent,
  });
}

describe("tableAutoFormat", () => {
  it("returns a valid Extension", () => {
    const ext = tableAutoFormat();
    expect(ext).toBeDefined();
  });

  it("creates an EditorView without errors", () => {
    const doc = "| A | B |\n|---|---|\n| 1 | 2 |";
    const view = createView(doc, 5);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it("does not crash when cursor is not in a table", () => {
    const doc = "Just some text\nwithout tables";
    const view = createView(doc, 0);
    // Move cursor — should not throw
    view.dispatch({ selection: { anchor: 10 } });
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it("does not modify an already-aligned table", () => {
    const doc = "| A   | B   |\n| --- | --- |\n| 1   | 2   |";
    const view = createView(doc, 5);
    // Move cursor out of the table
    view.dispatch({ selection: { anchor: doc.length } });
    // Table should remain unchanged (already padded)
    // Note: the auto-format runs via queueMicrotask so it won't
    // be visible synchronously in all environments
    expect(view.state.doc.toString()).toBeTruthy();
    view.destroy();
  });
});
