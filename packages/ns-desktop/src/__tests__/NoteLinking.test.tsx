import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Unit: extractWikiLinks (pure function, no mocks needed)
// ---------------------------------------------------------------------------

// Import extractWikiLinks directly — it's a pure function
const { extractWikiLinks } = await import("../lib/db.ts");

describe("extractWikiLinks", () => {
  it("extracts a single wiki-link", () => {
    expect(extractWikiLinks("See [[My Note]] here")).toEqual(["My Note"]);
  });

  it("extracts multiple wiki-links", () => {
    expect(
      extractWikiLinks("Link to [[Note A]] and [[Note B]]"),
    ).toEqual(["Note A", "Note B"]);
  });

  it("deduplicates by case (keeps first occurrence)", () => {
    expect(
      extractWikiLinks("[[Hello]] and [[hello]] and [[HELLO]]"),
    ).toEqual(["Hello"]);
  });

  it("returns empty array for content without wiki-links", () => {
    expect(extractWikiLinks("No links here")).toEqual([]);
  });

  it("returns empty array for empty content", () => {
    expect(extractWikiLinks("")).toEqual([]);
  });

  it("trims whitespace from link text", () => {
    expect(extractWikiLinks("[[  Spaces  ]]")).toEqual(["Spaces"]);
  });

  it("ignores nested brackets", () => {
    expect(extractWikiLinks("[[[nested]]]")).toEqual(["nested"]);
  });

  it("handles links at start and end of content", () => {
    expect(extractWikiLinks("[[Start]] middle [[End]]")).toEqual([
      "Start",
      "End",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Integration: syncNoteLinks, getBacklinks, listNoteTitles (mock db)
// ---------------------------------------------------------------------------

// These tests need the db mock
describe("note link db functions", () => {
  const mockExecute = vi.fn();
  const mockSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function getDbFunctions() {
    vi.doMock("uuid", () => ({
      v4: () => "mock-uuid-link",
    }));

    vi.doMock("@tauri-apps/plugin-sql", () => ({
      default: {
        load: vi.fn().mockResolvedValue({
          execute: mockExecute,
          select: mockSelect,
        }),
      },
    }));

    return import("../lib/db.ts");
  }

  it("syncNoteLinks deletes existing links and inserts resolved ones", async () => {
    const { syncNoteLinks } = await getDbFunctions();

    // Mock: DELETE, then SELECT for title resolution, then INSERT
    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });
    mockSelect.mockResolvedValueOnce([
      { id: "target-1", title: "Note A" },
    ]);

    await syncNoteLinks("source-1", "Link to [[Note A]]");

    // First call: DELETE existing links
    expect(mockExecute.mock.calls[0][0]).toContain("DELETE FROM note_links");
    expect(mockExecute.mock.calls[0][1]).toEqual(["source-1"]);

    // Should resolve titles
    expect(mockSelect.mock.calls[0][0]).toContain("LOWER(title)");

    // Should INSERT the resolved link
    const insertCall = mockExecute.mock.calls.find((call: unknown[]) =>
      (call[0] as string).includes("INSERT OR IGNORE INTO note_links"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain("source-1");
    expect(insertCall![1]).toContain("target-1");
    expect(insertCall![1]).toContain("Note A");
  });

  it("syncNoteLinks skips self-links", async () => {
    const { syncNoteLinks } = await getDbFunctions();

    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });
    mockSelect.mockResolvedValueOnce([
      { id: "source-1", title: "Self" },
    ]);

    await syncNoteLinks("source-1", "Link to [[Self]]");

    // DELETE is called, but no INSERT should happen (self-link filtered)
    const insertCalls = mockExecute.mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes("INSERT OR IGNORE INTO note_links"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("syncNoteLinks does nothing for content without links", async () => {
    const { syncNoteLinks } = await getDbFunctions();

    mockExecute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });

    await syncNoteLinks("source-1", "No links here");

    // Only the DELETE call
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0][0]).toContain("DELETE FROM note_links");
  });

  it("getBacklinks returns incoming links from non-deleted notes", async () => {
    const { getBacklinks } = await getDbFunctions();

    mockSelect.mockResolvedValueOnce([
      { link_text: "Target", note_id: "src-1", note_title: "Source Note" },
    ]);

    const backlinks = await getBacklinks("target-1");

    expect(backlinks).toEqual([
      { noteId: "src-1", noteTitle: "Source Note", linkText: "Target" },
    ]);
    expect(mockSelect.mock.calls[0][0]).toContain("target_note_id = $1");
    expect(mockSelect.mock.calls[0][0]).toContain("is_deleted = 0");
  });

  it("listNoteTitles returns sorted non-deleted note titles", async () => {
    const { listNoteTitles } = await getDbFunctions();

    mockSelect.mockResolvedValueOnce([
      { id: "n1", title: "Alpha" },
      { id: "n2", title: "Beta" },
    ]);

    const titles = await listNoteTitles();

    expect(titles).toEqual([
      { id: "n1", title: "Alpha" },
      { id: "n2", title: "Beta" },
    ]);
    expect(mockSelect.mock.calls[0][0]).toContain("is_deleted = 0");
    expect(mockSelect.mock.calls[0][0]).toContain("ORDER BY title COLLATE NOCASE ASC");
  });
});

// ---------------------------------------------------------------------------
// Component: BacklinksPanel
// ---------------------------------------------------------------------------

describe("BacklinksPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it("renders backlinks when they exist", async () => {
    vi.doMock("../lib/db.ts", () => ({
      getBacklinks: vi.fn().mockResolvedValue([
        { noteId: "src-1", noteTitle: "Source Note", linkText: "My Note" },
      ]),
    }));
    vi.doMock("../hooks/useResizable.ts", () => ({
      useResizable: () => ({
        size: 150,
        isDragging: false,
        onPointerDown: vi.fn(),
      }),
    }));
    vi.doMock("./ResizeDivider.tsx", () => ({
      ResizeDivider: () => <div data-testid="resize-divider" />,
    }));

    const { BacklinksPanel } = await import("../components/BacklinksPanel.tsx");
    const onNavigate = vi.fn();

    render(<BacklinksPanel noteId="target-1" onNavigate={onNavigate} />);

    // Wait for async load
    const button = await screen.findByText("Source Note");
    expect(button).toBeInTheDocument();
    expect(screen.getByText(/via \[\[My Note\]\]/)).toBeInTheDocument();

    // Click navigates
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith("src-1");
  });

  it("returns null when no backlinks exist", async () => {
    vi.doMock("../lib/db.ts", () => ({
      getBacklinks: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("../hooks/useResizable.ts", () => ({
      useResizable: () => ({
        size: 150,
        isDragging: false,
        onPointerDown: vi.fn(),
      }),
    }));
    vi.doMock("./ResizeDivider.tsx", () => ({
      ResizeDivider: () => <div data-testid="resize-divider" />,
    }));

    const { BacklinksPanel } = await import("../components/BacklinksPanel.tsx");

    const { container } = render(
      <BacklinksPanel noteId="target-1" onNavigate={vi.fn()} />,
    );

    // Wait for the async effect to resolve — panel renders nothing
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe("");
  });

  it("collapse state persists to localStorage", async () => {
    vi.doMock("../lib/db.ts", () => ({
      getBacklinks: vi.fn().mockResolvedValue([
        { noteId: "src-1", noteTitle: "Source", linkText: "Link" },
      ]),
    }));
    vi.doMock("../hooks/useResizable.ts", () => ({
      useResizable: () => ({
        size: 150,
        isDragging: false,
        onPointerDown: vi.fn(),
      }),
    }));
    vi.doMock("./ResizeDivider.tsx", () => ({
      ResizeDivider: () => <div data-testid="resize-divider" />,
    }));

    const { BacklinksPanel } = await import("../components/BacklinksPanel.tsx");

    render(<BacklinksPanel noteId="target-1" onNavigate={vi.fn()} />);

    // Wait for load
    const toggle = await screen.findByText(/Backlinks/);
    expect(toggle).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(toggle);
    expect(localStorage.getItem("ns-backlinks-collapsed")).toBe("true");

    // Click to expand
    fireEvent.click(toggle);
    expect(localStorage.getItem("ns-backlinks-collapsed")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Component: MarkdownPreview with wiki-links
// ---------------------------------------------------------------------------

describe("MarkdownPreview wiki-links", () => {
  it("renders resolved wiki-links as clickable elements", async () => {
    const { MarkdownPreview } = await import("../components/MarkdownPreview.tsx");

    const titleMap = new Map([["my note", "note-123"]]);
    const onClick = vi.fn();

    const { container } = render(
      <MarkdownPreview
        content="See [[My Note]] here"
        wikiLinkTitleMap={titleMap}
        onWikiLinkClick={onClick}
      />,
    );

    const wikiLink = container.querySelector(".wiki-link");
    expect(wikiLink).toBeInTheDocument();
    expect(wikiLink).toHaveAttribute("data-wiki-link", "note-123");
    expect(wikiLink).toHaveTextContent("My Note");

    // Click should trigger onWikiLinkClick
    fireEvent.click(wikiLink!);
    expect(onClick).toHaveBeenCalledWith("note-123");
  });

  it("renders unresolved wiki-links with broken style", async () => {
    const { MarkdownPreview } = await import("../components/MarkdownPreview.tsx");

    const titleMap = new Map<string, string>(); // empty — nothing resolves

    const { container } = render(
      <MarkdownPreview
        content="See [[Missing Note]] here"
        wikiLinkTitleMap={titleMap}
      />,
    );

    const broken = container.querySelector(".wiki-link-broken");
    expect(broken).toBeInTheDocument();
    expect(broken).toHaveTextContent("[[Missing Note]]");
  });

  it("renders normally without wiki-link props", async () => {
    const { MarkdownPreview } = await import("../components/MarkdownPreview.tsx");

    render(<MarkdownPreview content="Plain [[text]] here" />);

    // Should render as plain text with brackets
    expect(screen.getByText(/Plain/)).toBeInTheDocument();
  });
});
