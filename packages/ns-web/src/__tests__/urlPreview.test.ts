import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { LinkPreview } from "@derekentringer/shared/ns";
import { urlPreviewExtension } from "../editor/urlPreview.ts";

// Helper that builds a headless CodeMirror view with the URL-preview
// extension wired up. The extension only listens to *transactions* —
// no DOM/clipboard interaction is needed, so we can drive it by
// dispatching changes with `userEvent: "input.paste"` directly.
function buildView(opts: {
  enabled: boolean;
  fetchResult?: LinkPreview | Error;
  onPreviewInserted?: (ctx: { url: string; revert: () => void }) => void;
}) {
  const fetch = vi.fn(async (_url: string) => {
    if (opts.fetchResult instanceof Error) throw opts.fetchResult;
    return (
      opts.fetchResult ?? {
        url: _url,
        title: null,
        description: null,
        imageUrl: null,
      }
    );
  });

  const ext = urlPreviewExtension({
    enabled: () => opts.enabled,
    fetch,
    onPreviewInserted: opts.onPreviewInserted,
  });

  const state = EditorState.create({ doc: "", extensions: [ext] });
  const view = new EditorView({ state });

  return { view, fetch };
}

function pasteText(view: EditorView, from: number, text: string) {
  view.dispatch({
    changes: { from, to: from, insert: text },
    userEvent: "input.paste",
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("urlPreviewExtension", () => {
  it("does nothing when enabled() returns false", async () => {
    const { view, fetch } = buildView({ enabled: false });
    pasteText(view, 0, "https://example.com");
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("https://example.com");
  });

  it("does nothing when the pasted content is not a URL", async () => {
    const { view, fetch } = buildView({ enabled: true });
    pasteText(view, 0, "just some text I copied");
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("just some text I copied");
  });

  it("replaces a pasted URL with the structured preview markdown", async () => {
    const { view, fetch } = buildView({
      enabled: true,
      fetchResult: {
        url: "https://example.com/article",
        title: "Cool Article",
        description: "An interesting summary.",
        imageUrl: "https://cdn.example.com/img.png",
      },
    });

    pasteText(view, 0, "https://example.com/article");
    expect(fetch).toHaveBeenCalledWith("https://example.com/article");
    // Wait a microtask so the awaited fetch promise settles.
    await Promise.resolve();
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe(
      "**Cool Article**\n\nAn interesting summary.\n\n![Cool Article](https://cdn.example.com/img.png)\n\nhttps://example.com/article",
    );
  });

  it("invokes onPreviewInserted with a working revert closure", async () => {
    let revertFn: (() => void) | null = null;
    const { view } = buildView({
      enabled: true,
      fetchResult: {
        url: "https://example.com/x",
        title: "Title",
        description: null,
        imageUrl: null,
      },
      onPreviewInserted: ({ revert }) => {
        revertFn = revert;
      },
    });

    pasteText(view, 0, "https://example.com/x");
    await Promise.resolve();
    await Promise.resolve();
    expect(view.state.doc.toString()).toBe(
      "**Title**\n\nhttps://example.com/x",
    );
    expect(revertFn).not.toBeNull();

    revertFn!();
    expect(view.state.doc.toString()).toBe("https://example.com/x");
  });

  it("skips replacement and toast when the preview has no usable metadata", async () => {
    const onPreviewInserted = vi.fn();
    const { view } = buildView({
      enabled: true,
      fetchResult: {
        url: "https://blocked.example/x",
        title: null,
        description: null,
        imageUrl: null,
      },
      onPreviewInserted,
    });

    pasteText(view, 0, "https://blocked.example/x");
    await Promise.resolve();
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe("https://blocked.example/x");
    expect(onPreviewInserted).not.toHaveBeenCalled();
  });

  it("leaves the bare URL in place when the fetch fails", async () => {
    const { view } = buildView({
      enabled: true,
      fetchResult: new Error("boom"),
    });
    pasteText(view, 0, "https://example.com/dead");
    await Promise.resolve();
    await Promise.resolve();
    expect(view.state.doc.toString()).toBe("https://example.com/dead");
  });

  it("revert still works after the user has typed before the inserted block", async () => {
    let revertFn: (() => void) | null = null;
    const { view } = buildView({
      enabled: true,
      fetchResult: {
        url: "https://example.com/x",
        title: "Title",
        description: null,
        imageUrl: null,
      },
      onPreviewInserted: ({ revert }) => {
        revertFn = revert;
      },
    });

    pasteText(view, 0, "https://example.com/x");
    await Promise.resolve();
    await Promise.resolve();

    // Simulate the user adding text before the preview after the
    // replacement — the tracked range should be mapped through and
    // revert should still target the right section.
    view.dispatch({
      changes: { from: 0, to: 0, insert: "PREFIX " },
    });
    expect(view.state.doc.toString()).toBe(
      "PREFIX **Title**\n\nhttps://example.com/x",
    );

    revertFn!();
    expect(view.state.doc.toString()).toBe(
      "PREFIX https://example.com/x",
    );
  });
});
