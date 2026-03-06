import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import type { FolderInfo, Note } from "@derekentringer/shared/ns";

function makeFolder(overrides: Partial<FolderInfo> = {}): FolderInfo {
  return {
    id: "folder-1",
    name: "Work",
    parentId: null,
    sortOrder: 0,
    favorite: true,
    count: 3,
    totalCount: 3,
    createdAt: "2025-01-01T00:00:00.000Z",
    children: [],
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Favorite Note",
    content: "Some content",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: true,
    sortOrder: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

const defaultProps = {
  favoriteFolders: [] as FolderInfo[],
  favoriteNotes: [] as Note[],
  activeFolder: null as string | null,
  selectedNoteId: null as string | null,
  onSelectFolder: vi.fn(),
  onSelectNote: vi.fn(),
  onUnfavoriteFolder: vi.fn(),
  onUnfavoriteNote: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("FavoritesPanel", () => {
  it("renders nothing when no favorites", () => {
    const { container } = render(<FavoritesPanel {...defaultProps} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders section header when items exist", () => {
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
      />,
    );
    expect(screen.getByText("Favorites")).toBeInTheDocument();
  });

  it("renders favorite folders and notes", () => {
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
        favoriteNotes={[makeNote()]}
      />,
    );
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Favorite Note")).toBeInTheDocument();
  });

  it("calls onSelectFolder when folder is clicked", () => {
    const onSelectFolder = vi.fn();
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
        onSelectFolder={onSelectFolder}
      />,
    );
    fireEvent.click(screen.getByText("Work"));
    expect(onSelectFolder).toHaveBeenCalledWith("folder-1");
  });

  it("calls onSelectNote when note is clicked", () => {
    const onSelectNote = vi.fn();
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        onSelectNote={onSelectNote}
      />,
    );
    fireEvent.click(screen.getByText("Favorite Note"));
    expect(onSelectNote).toHaveBeenCalledWith("note-1");
  });

  it("shows Unfavorite context menu on right-click", () => {
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Favorite Note"));
    expect(screen.getByText("Unfavorite")).toBeInTheDocument();
  });

  it("calls onUnfavoriteNote from context menu", () => {
    const onUnfavoriteNote = vi.fn();
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        onUnfavoriteNote={onUnfavoriteNote}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Favorite Note"));
    fireEvent.click(screen.getByText("Unfavorite"));
    expect(onUnfavoriteNote).toHaveBeenCalledWith("note-1");
  });

  it("calls onUnfavoriteFolder from context menu", () => {
    const onUnfavoriteFolder = vi.fn();
    render(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
        onUnfavoriteFolder={onUnfavoriteFolder}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Work"));
    fireEvent.click(screen.getByText("Unfavorite"));
    expect(onUnfavoriteFolder).toHaveBeenCalledWith("folder-1");
  });

  it("collapse/expand toggle persists", () => {
    const { rerender } = render(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
      />,
    );

    // Items visible initially
    expect(screen.getByText("Work")).toBeInTheDocument();

    // Click collapse
    fireEvent.click(screen.getByText("Favorites"));
    expect(localStorage.getItem("ns-favorites-collapsed")).toBe("true");

    // Items should be hidden
    expect(screen.queryByText("Work")).not.toBeInTheDocument();

    // Re-render preserves collapsed state
    rerender(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
      />,
    );
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
  });
});
