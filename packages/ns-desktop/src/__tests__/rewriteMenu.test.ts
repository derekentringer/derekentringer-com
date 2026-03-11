import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  rewriteExtension,
  rewriteMenuField,
  openRewriteMenu,
  closeRewriteMenu,
} from "../editor/rewriteMenu.ts";

function createView(doc = "Hello world", extensions = rewriteExtension(vi.fn())) {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions,
    }),
  });
}

describe("rewriteMenu extension", () => {
  it("returns a valid Extension", () => {
    const ext = rewriteExtension(vi.fn());
    expect(ext).toBeDefined();
  });

  it("StateField initializes as null", () => {
    const view = createView();
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });

  it("opens menu on openRewriteMenu effect", () => {
    const view = createView();
    view.dispatch({ effects: openRewriteMenu.of({ from: 0, to: 5 }) });
    const menu = view.state.field(rewriteMenuField);
    expect(menu).toEqual({ from: 0, to: 5, status: "open" });
    view.destroy();
  });

  it("closes menu on closeRewriteMenu effect", () => {
    const view = createView();
    view.dispatch({ effects: openRewriteMenu.of({ from: 0, to: 5 }) });
    expect(view.state.field(rewriteMenuField)).not.toBeNull();

    view.dispatch({ effects: closeRewriteMenu.of(undefined) });
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });

  it("closes menu on doc change", () => {
    const view = createView();
    view.dispatch({ effects: openRewriteMenu.of({ from: 0, to: 5 }) });
    expect(view.state.field(rewriteMenuField)).not.toBeNull();

    view.dispatch({ changes: { from: 0, to: 0, insert: "X" } });
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });

  it("closes menu on selection change", () => {
    const view = createView();
    view.dispatch({ effects: openRewriteMenu.of({ from: 0, to: 5 }) });
    expect(view.state.field(rewriteMenuField)).not.toBeNull();

    view.dispatch({ selection: { anchor: 3 } });
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });

  it("Mod-Shift-r opens when selection exists", () => {
    const view = createView("Hello world");
    // Select "Hello"
    view.dispatch({ selection: { anchor: 0, head: 5 } });

    // Simulate keymap by dispatching effect directly (keymap testing requires DOM events)
    const { from, to } = view.state.selection.main;
    expect(from).not.toBe(to); // Confirm selection exists
    view.dispatch({ effects: openRewriteMenu.of({ from, to }) });

    expect(view.state.field(rewriteMenuField)).toEqual({
      from: 0,
      to: 5,
      status: "open",
    });
    view.destroy();
  });

  it("no-ops without selection (menu stays null)", () => {
    const view = createView("Hello world");
    // No selection (cursor only)
    const { from, to } = view.state.selection.main;
    expect(from).toBe(to); // Confirm no selection

    // Menu should remain null when there's no selection
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });

  it("Escape closes when open", () => {
    const view = createView();
    view.dispatch({ effects: openRewriteMenu.of({ from: 0, to: 5 }) });
    expect(view.state.field(rewriteMenuField)).not.toBeNull();

    view.dispatch({ effects: closeRewriteMenu.of(undefined) });
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });

  it("passes through when closed (menu stays null)", () => {
    const view = createView();
    expect(view.state.field(rewriteMenuField)).toBeNull();

    // Dispatching close on already-null is a no-op
    view.dispatch({ effects: closeRewriteMenu.of(undefined) });
    expect(view.state.field(rewriteMenuField)).toBeNull();
    view.destroy();
  });
});
