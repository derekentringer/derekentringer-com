import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import type { FolderInfo, Note, NoteSortField, SortOrder } from "@derekentringer/ns-shared";

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
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
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
  favSortBy: "title" as NoteSortField,
  favSortOrder: "asc" as SortOrder,
  onFavSortByChange: vi.fn(),
  onFavSortOrderChange: vi.fn(),
};

function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("FavoritesPanel", () => {
  it("renders nothing when no favorites", () => {
    const { container } = renderWithDnd(<FavoritesPanel {...defaultProps} />);
    expect(container.querySelector("[data-testid='favorites-panel']")).toBeNull();
  });

  it("renders section header with icon when items exist", () => {
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
      />,
    );
    expect(screen.getByText("Favorites")).toBeInTheDocument();
  });

  it("renders favorite folders and notes", () => {
    renderWithDnd(
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
    renderWithDnd(
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
    vi.useFakeTimers();
    const onSelectNote = vi.fn();
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        onSelectNote={onSelectNote}
      />,
    );
    fireEvent.click(screen.getByText("Favorite Note"));
    vi.advanceTimersByTime(200);
    expect(onSelectNote).toHaveBeenCalledWith("note-1");
    vi.useRealTimers();
  });

  it("shows Unfavorite context menu on right-click", () => {
    renderWithDnd(
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
    renderWithDnd(
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
    renderWithDnd(
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

  it("always shows items when favorites exist", () => {
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteFolders={[makeFolder()]}
      />,
    );

    // Items visible
    expect(screen.getByText("Work")).toBeInTheDocument();
    // Header visible
    expect(screen.getByText("Favorites")).toBeInTheDocument();
  });

  // Sort controls tests
  it("renders sort dropdown with correct value", () => {
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        favSortBy="updatedAt"
      />,
    );
    const select = screen.getByTestId("fav-sort-by") as HTMLSelectElement;
    expect(select.value).toBe("updatedAt");
  });

  it("calls onFavSortByChange when sort dropdown changes", () => {
    const onFavSortByChange = vi.fn();
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        onFavSortByChange={onFavSortByChange}
      />,
    );
    fireEvent.change(screen.getByTestId("fav-sort-by"), { target: { value: "createdAt" } });
    expect(onFavSortByChange).toHaveBeenCalledWith("createdAt");
  });

  it("calls onFavSortOrderChange when direction button is clicked", () => {
    const onFavSortOrderChange = vi.fn();
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        favSortOrder="asc"
        onFavSortOrderChange={onFavSortOrderChange}
      />,
    );
    fireEvent.click(screen.getByTestId("fav-sort-order"));
    expect(onFavSortOrderChange).toHaveBeenCalledWith("desc");
  });

  it("always shows sort controls when favorites exist", () => {
    renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
      />,
    );
    expect(screen.getByTestId("fav-sort-by")).toBeInTheDocument();
  });

  it("shows drag handles only when sort is manual", () => {
    const { rerender } = renderWithDnd(
      <FavoritesPanel
        {...defaultProps}
        favoriteNotes={[makeNote()]}
        favSortBy="sortOrder"
      />,
    );
    expect(screen.getByLabelText("Drag to reorder")).toBeInTheDocument();

    rerender(
      <DndContext>
        <FavoritesPanel
          {...defaultProps}
          favoriteNotes={[makeNote()]}
          favSortBy="title"
        />
      </DndContext>,
    );
    expect(screen.queryByLabelText("Drag to reorder")).not.toBeInTheDocument();
  });
});
