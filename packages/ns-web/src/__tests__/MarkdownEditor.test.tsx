import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { MarkdownEditorHandle } from "../components/MarkdownEditor.tsx";

// CodeMirror has limited jsdom support. Mock at module level so page-level
// tests don't break, while still validating the component API contract.

const mockDestroy = vi.fn();
const mockFocus = vi.fn();
const mockDispatch = vi.fn();

vi.mock("@codemirror/view", () => {
  class MockEditorView {
    dom = document.createElement("div");
    state = { doc: { toString: () => "" } };
    destroy = mockDestroy;
    focus = mockFocus;
    dispatch = mockDispatch;
    constructor(config: { parent?: HTMLElement }) {
      if (config.parent) {
        config.parent.appendChild(this.dom);
      }
    }
    static theme() {
      return [];
    }
    static baseTheme() {
      return [];
    }
    static lineWrapping = [];
    static updateListener = { of: () => [] };
    static atomicRanges = { of: () => [] };
  }
  const MockDecoration = {
    replace: () => ({ range: () => ({}) }),
    mark: () => ({ range: () => ({}) }),
    widget: () => ({ range: () => ({}) }),
    set: () => ({}),
    none: {},
  };
  return {
    EditorView: MockEditorView,
    keymap: { of: () => [] },
    placeholder: () => [],
    lineNumbers: () => [],
    drawSelection: () => [],
    Decoration: MockDecoration,
    ViewPlugin: { fromClass: () => [] },
    WidgetType: class {},
  };
});

vi.mock("@codemirror/state", () => {
  class MockCompartment {
    of() {
      return [];
    }
    reconfigure() {
      return {};
    }
  }
  return {
    EditorState: {
      create: () => ({
        doc: { toString: () => "" },
      }),
      readOnly: { of: () => [] },
      tabSize: { of: () => [] },
    },
    Compartment: MockCompartment,
    RangeSet: { of: () => ({}) },
  };
});

vi.mock("@codemirror/lang-markdown", () => ({
  markdown: () => [],
}));

vi.mock("@lezer/markdown", () => ({
  GFM: [],
}));

vi.mock("@codemirror/language-data", () => ({
  languages: [],
}));

vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
  history: () => [],
  historyKeymap: [],
  indentWithTab: {},
}));

vi.mock("@codemirror/language", () => ({
  HighlightStyle: { define: () => ({}) },
  syntaxHighlighting: () => [],
  syntaxTree: () => ({ iterate: () => {} }),
  indentUnit: { of: () => [] },
}));

vi.mock("@lezer/highlight", () => ({
  tags: new Proxy(
    {},
    { get: () => "tag" },
  ),
}));

// Import after mocks
const { MarkdownEditor } = await import(
  "../components/MarkdownEditor.tsx"
);

describe("MarkdownEditor", () => {
  it("renders without crash", () => {
    const { container } = render(
      <MarkdownEditor value="" onChange={() => {}} />,
    );
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
  });

  it("cleans up EditorView on unmount", () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    cleanup();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("exposes focus via imperative handle", () => {
    const ref = React.createRef<MarkdownEditorHandle>();
    render(<MarkdownEditor ref={ref} value="" onChange={() => {}} />);
    ref.current?.focus();
    expect(mockFocus).toHaveBeenCalled();
  });

  it("accepts className prop", () => {
    const { container } = render(
      <MarkdownEditor value="" onChange={() => {}} className="test-cls" />,
    );
    expect(container.firstChild).toHaveClass("test-cls");
  });
});
