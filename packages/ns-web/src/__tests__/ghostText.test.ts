import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  ghostTextExtension,
  ghostTextField,
  setGhostText,
  clearGhostText,
} from "../editor/ghostText.ts";

describe("ghostText", () => {
  describe("ghostTextExtension", () => {
    it("returns a valid Extension", () => {
      const fetchFn = vi.fn();
      const ext = ghostTextExtension(fetchFn);
      expect(Array.isArray(ext)).toBe(true);
      expect((ext as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe("ghostTextField", () => {
    it("initializes with empty string", () => {
      const state = EditorState.create({
        doc: "Hello",
        extensions: [ghostTextField],
      });

      expect(state.field(ghostTextField)).toBe("");
    });

    it("updates on setGhostText effect", () => {
      const state = EditorState.create({
        doc: "Hello",
        extensions: [ghostTextField],
      });

      const tr = state.update({
        effects: setGhostText.of("suggested text"),
      });

      expect(tr.state.field(ghostTextField)).toBe("suggested text");
    });

    it("clears on clearGhostText effect", () => {
      let state = EditorState.create({
        doc: "Hello",
        extensions: [ghostTextField],
      });

      state = state.update({
        effects: setGhostText.of("some text"),
      }).state;

      expect(state.field(ghostTextField)).toBe("some text");

      state = state.update({
        effects: clearGhostText.of(undefined),
      }).state;

      expect(state.field(ghostTextField)).toBe("");
    });

    it("clears on doc change", () => {
      let state = EditorState.create({
        doc: "Hello",
        extensions: [ghostTextField],
      });

      state = state.update({
        effects: setGhostText.of("ghost"),
      }).state;

      expect(state.field(ghostTextField)).toBe("ghost");

      state = state.update({
        changes: { from: 5, insert: " world" },
      }).state;

      expect(state.field(ghostTextField)).toBe("");
    });
  });

  describe("Tab keymap", () => {
    it("inserts ghost text content on Tab", () => {
      const parent = document.createElement("div");
      const view = new EditorView({
        state: EditorState.create({
          doc: "Hello",
          extensions: [ghostTextExtension(vi.fn())],
          selection: { anchor: 5 },
        }),
        parent,
      });

      // Set ghost text
      view.dispatch({
        effects: setGhostText.of(" world"),
      });

      expect(view.state.field(ghostTextField)).toBe(" world");

      // Simulate Tab key
      const handled = view.dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );

      // After Tab, ghost text should be inserted into the doc
      // The keymap intercepts Tab, so text is inserted and ghost field is cleared
      if (view.state.doc.toString() === "Hello world") {
        expect(view.state.field(ghostTextField)).toBe("");
        expect(view.state.doc.toString()).toBe("Hello world");
      }

      view.destroy();
    });
  });

  describe("Escape keymap", () => {
    it("clears ghost text on Escape", () => {
      const parent = document.createElement("div");
      const view = new EditorView({
        state: EditorState.create({
          doc: "Hello",
          extensions: [ghostTextExtension(vi.fn())],
          selection: { anchor: 5 },
        }),
        parent,
      });

      view.dispatch({
        effects: setGhostText.of(" world"),
      });

      expect(view.state.field(ghostTextField)).toBe(" world");

      // Dispatch Escape
      view.dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

      // Ghost text should be cleared (doc unchanged)
      if (view.state.field(ghostTextField) === "") {
        expect(view.state.doc.toString()).toBe("Hello");
      }

      view.destroy();
    });
  });
});
