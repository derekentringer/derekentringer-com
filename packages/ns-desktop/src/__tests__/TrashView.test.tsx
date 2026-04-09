import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@derekentringer/ns-shared";
import { TrashPanel } from "../components/TrashPanel.tsx";

function makeNote(id: string, title: string): Note {
  return {
    id,
    title,
    content: `Content of ${title}`,
    tags: ["tag1"],
    folderId: null,
    folder: null,
    folderPath: "",
    summary: "",
    sortOrder: 0,
    favorite: false,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    deletedAt: "2026-03-15T10:30:00Z",
  };
}

const defaultProps = {
  notes: [makeNote("1", "Note A"), makeNote("2", "Note B")],
  selectedId: null,
  onSelect: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrashPanel", () => {
  it("renders back button", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("calls onBack when back button clicked", async () => {
    render(<TrashPanel {...defaultProps} />);
    await userEvent.click(screen.getByText("Back"));
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it("shows item count", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("shows note titles", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByText("Note A")).toBeInTheDocument();
    expect(screen.getByText("Note B")).toBeInTheDocument();
  });

  it("shows note content snippets", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByText("Content of Note A")).toBeInTheDocument();
  });

  it("shows deletion date", () => {
    render(<TrashPanel {...defaultProps} />);
    const deletedLabels = screen.getAllByText(/Deleted/);
    expect(deletedLabels.length).toBeGreaterThan(0);
  });

  it("shows empty state when no notes", () => {
    render(<TrashPanel {...defaultProps} notes={[]} />);
    expect(screen.getByText("Trash is empty")).toBeInTheDocument();
  });

  it("has sort dropdown", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByLabelText("Sort by")).toBeInTheDocument();
  });

  it("has filter input", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText("Filter trash...")).toBeInTheDocument();
  });

  it("filters notes by title", async () => {
    render(<TrashPanel {...defaultProps} />);
    const input = screen.getByPlaceholderText("Filter trash...");
    await userEvent.type(input, "Note A");
    expect(screen.getByText("Note A")).toBeInTheDocument();
    expect(screen.queryByText("Note B")).not.toBeInTheDocument();
  });

  it("has select toggle button", () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.getByText("Select")).toBeInTheDocument();
  });

  it("shows checkboxes when select mode enabled", async () => {
    render(<TrashPanel {...defaultProps} />);
    expect(screen.queryByLabelText("Select Note A")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Select"));
    expect(screen.getByLabelText("Select Note A")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Note B")).toBeInTheDocument();
  });

  it("hides checkboxes when select mode disabled", async () => {
    render(<TrashPanel {...defaultProps} />);
    await userEvent.click(screen.getByText("Select"));
    expect(screen.getByLabelText("Select Note A")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Done"));
    expect(screen.queryByLabelText("Select Note A")).not.toBeInTheDocument();
  });

  it("selects note on click when not in select mode", async () => {
    render(<TrashPanel {...defaultProps} />);
    await userEvent.click(screen.getByText("Note A"));
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  it("shows empty trash button in select mode with no selection", async () => {
    render(<TrashPanel {...defaultProps} />);
    await userEvent.click(screen.getByText("Select"));
    expect(screen.getByText("Empty Trash")).toBeInTheDocument();
  });

  it("shows restore and delete buttons when items selected", async () => {
    render(<TrashPanel {...defaultProps} />);
    await userEvent.click(screen.getByText("Select"));
    await userEvent.click(screen.getByLabelText("Select Note A"));

    expect(screen.getByText("Restore (1)")).toBeInTheDocument();
    expect(screen.getByText("Delete (1)")).toBeInTheDocument();
  });

  it("calls onRestore with selected ids", async () => {
    render(<TrashPanel {...defaultProps} />);
    await userEvent.click(screen.getByText("Select"));
    await userEvent.click(screen.getByLabelText("Select Note A"));
    await userEvent.click(screen.getByText("Restore (1)"));

    expect(defaultProps.onRestore).toHaveBeenCalledWith(["1"]);
  });

  it("highlights selected note", () => {
    render(<TrashPanel {...defaultProps} selectedId="1" />);
    const noteA = screen.getByText("Note A");
    expect(noteA.className).toContain("text-foreground");
  });

  it("shows singular item count for one note", () => {
    render(<TrashPanel {...defaultProps} notes={[makeNote("1", "Only Note")]} />);
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });
});
