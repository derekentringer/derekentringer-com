import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderTree, flattenFolderTree, getFolderBreadcrumb } from "../components/FolderTree.tsx";
import type { FolderInfo } from "@derekentringer/ns-shared";

function makeFolder(overrides: Partial<FolderInfo> = {}): FolderInfo {
  return {
    id: "folder-1",
    name: "Test Folder",
    parentId: null,
    sortOrder: 0,
    favorite: false,
    count: 0,
    totalCount: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    children: [],
    ...overrides,
  };
}

const defaultProps = {
  folders: [] as FolderInfo[],
  activeFolder: null as string | null,
  totalNotes: 10,
  onSelectFolder: vi.fn(),
  onCreateFolder: vi.fn(),
  onRenameFolder: vi.fn(),
  onDeleteFolder: vi.fn(),
  onMoveFolder: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("FolderTree", () => {
  it("renders 'All Notes' entry with total count", () => {
    render(<FolderTree {...defaultProps} totalNotes={42} />);
    const allNotesBtn = screen.getByText("All Notes").closest("button");
    expect(allNotesBtn).toBeInTheDocument();
    expect(allNotesBtn?.textContent).toContain("42");
  });

  it("renders 'Unfiled' entry when there are unfiled notes", () => {
    const folders = [makeFolder({ count: 5, totalCount: 5 })];
    render(<FolderTree {...defaultProps} folders={folders} totalNotes={10} />);
    expect(screen.getByText("Unfiled")).toBeInTheDocument();
    // unfiled count = 10 - 5 = 5, but "5" also appears as folder totalCount
    const unfiledButton = screen.getByText("Unfiled").closest("button");
    expect(unfiledButton?.textContent).toContain("5");
  });

  it("does not render 'Unfiled' when all notes are in folders", () => {
    const folders = [makeFolder({ count: 10, totalCount: 10 })];
    render(<FolderTree {...defaultProps} folders={folders} totalNotes={10} />);
    expect(screen.queryByText("Unfiled")).not.toBeInTheDocument();
  });

  it("renders folder names", () => {
    const folders = [
      makeFolder({ id: "f1", name: "Work" }),
      makeFolder({ id: "f2", name: "Personal" }),
    ];
    render(<FolderTree {...defaultProps} folders={folders} />);
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("calls onSelectFolder(null) when All Notes is clicked", async () => {
    const onSelectFolder = vi.fn();
    render(<FolderTree {...defaultProps} onSelectFolder={onSelectFolder} />);
    await userEvent.click(screen.getByText("All Notes"));
    expect(onSelectFolder).toHaveBeenCalledWith(null);
  });

  it("calls onSelectFolder with folder ID when folder is clicked", async () => {
    const onSelectFolder = vi.fn();
    const folders = [makeFolder({ id: "f1", name: "Work" })];
    render(
      <FolderTree
        {...defaultProps}
        folders={folders}
        onSelectFolder={onSelectFolder}
      />,
    );
    await userEvent.click(screen.getByText("Work"));
    expect(onSelectFolder).toHaveBeenCalledWith("f1");
  });

  it("highlights the active folder", () => {
    const folders = [makeFolder({ id: "f1", name: "Active" })];
    render(
      <FolderTree {...defaultProps} folders={folders} activeFolder="f1" />,
    );
    const button = screen.getByText("Active").closest("button");
    expect(button).toHaveClass("bg-accent");
  });

  it("highlights All Notes when activeFolder is null", () => {
    render(<FolderTree {...defaultProps} activeFolder={null} />);
    const button = screen.getByText("All Notes").closest("button");
    expect(button).toHaveClass("bg-accent");
  });

  it("shows expand/collapse arrow for folders with children", () => {
    const folders = [
      makeFolder({
        id: "f1",
        name: "Parent",
        children: [makeFolder({ id: "f2", name: "Child", parentId: "f1" })],
      }),
    ];
    render(<FolderTree {...defaultProps} folders={folders} />);
    // Should see both parent and child (expanded by default)
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("shows context menu on right-click", async () => {
    const folders = [makeFolder({ id: "f1", name: "Right Click Me" })];
    render(<FolderTree {...defaultProps} folders={folders} />);

    const button = screen.getByText("Right Click Me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("New Subfolder")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("creates root folder via inline input", async () => {
    const onCreateFolder = vi.fn();
    render(
      <FolderTree {...defaultProps} onCreateFolder={onCreateFolder} />,
    );

    // Click the + button
    await userEvent.click(screen.getByTitle("New folder"));
    const input = screen.getByPlaceholderText("Folder name");
    await userEvent.type(input, "New Folder{Enter}");

    expect(onCreateFolder).toHaveBeenCalledWith("New Folder");
  });

  it("shows 'Move to Root' in context menu for nested folders", async () => {
    const folders = [
      makeFolder({
        id: "f1",
        name: "Parent",
        children: [makeFolder({ id: "f2", name: "Nested", parentId: "f1" })],
      }),
    ];
    render(<FolderTree {...defaultProps} folders={folders} />);

    const button = screen.getByText("Nested");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Move to Root")).toBeInTheDocument();
  });

  it("does not show 'Move to Root' for root-level folders", async () => {
    const folders = [makeFolder({ id: "f1", name: "Root Level" })];
    render(<FolderTree {...defaultProps} folders={folders} />);

    const button = screen.getByText("Root Level");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.queryByText("Move to Root")).not.toBeInTheDocument();
  });

  it("calls onMoveFolder when 'Move to Root' is clicked", async () => {
    const onMoveFolder = vi.fn();
    const folders = [
      makeFolder({
        id: "f1",
        name: "Parent",
        children: [makeFolder({ id: "f2", name: "Nested", parentId: "f1" })],
      }),
    ];
    render(
      <FolderTree {...defaultProps} folders={folders} onMoveFolder={onMoveFolder} />,
    );

    const button = screen.getByText("Nested");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Move to Root"));

    expect(onMoveFolder).toHaveBeenCalledWith("f2", null);
  });

  it("shows Favorite in context menu when onToggleFavorite is provided", async () => {
    const onToggleFavorite = vi.fn();
    const folders = [makeFolder({ id: "f1", name: "Fav Folder", favorite: false })];
    render(
      <FolderTree {...defaultProps} folders={folders} onToggleFavorite={onToggleFavorite} />,
    );

    const button = screen.getByText("Fav Folder");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Favorite")).toBeInTheDocument();
  });

  it("shows Unfavorite for already-favorited folders in context menu", async () => {
    const onToggleFavorite = vi.fn();
    const folders = [makeFolder({ id: "f1", name: "Fav Folder", favorite: true })];
    render(
      <FolderTree {...defaultProps} folders={folders} onToggleFavorite={onToggleFavorite} />,
    );

    const button = screen.getByText("Fav Folder");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Unfavorite")).toBeInTheDocument();
  });

  it("calls onToggleFavorite with correct args", async () => {
    const onToggleFavorite = vi.fn();
    const folders = [makeFolder({ id: "f1", name: "Toggle Fav", favorite: false })];
    render(
      <FolderTree {...defaultProps} folders={folders} onToggleFavorite={onToggleFavorite} />,
    );

    const button = screen.getByText("Toggle Fav");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Favorite"));

    expect(onToggleFavorite).toHaveBeenCalledWith("f1", true);
  });

  it("renders Folders header as non-collapsible label", () => {
    const folders = [makeFolder({ id: "f1", name: "Work" })];
    render(<FolderTree {...defaultProps} folders={folders} />);

    // Header is present
    expect(screen.getByText("Folders")).toBeInTheDocument();
    // Content is always visible (no collapse toggle)
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("All Notes")).toBeInTheDocument();
  });
});

describe("flattenFolderTree", () => {
  it("flattens nested folders with indentation", () => {
    const folders: FolderInfo[] = [
      makeFolder({
        id: "f1",
        name: "Root",
        children: [
          makeFolder({ id: "f2", name: "Child", parentId: "f1" }),
        ],
      }),
    ];

    const flat = flattenFolderTree(folders);
    expect(flat).toHaveLength(2);
    expect(flat[0]).toEqual({ id: "f1", name: "Root", depth: 0, displayName: "Root" });
    expect(flat[1]).toEqual({ id: "f2", name: "Child", depth: 1, displayName: "\u00B7\u00B7 Child" });
  });

  it("returns empty array for empty input", () => {
    expect(flattenFolderTree([])).toEqual([]);
  });
});

describe("getFolderBreadcrumb", () => {
  it("returns path from root to target folder", () => {
    const folders: FolderInfo[] = [
      makeFolder({
        id: "f1",
        name: "Root",
        children: [
          makeFolder({
            id: "f2",
            name: "Child",
            parentId: "f1",
            children: [
              makeFolder({ id: "f3", name: "Grandchild", parentId: "f2" }),
            ],
          }),
        ],
      }),
    ];

    const breadcrumb = getFolderBreadcrumb(folders, "f3");
    expect(breadcrumb).toEqual([
      { id: "f1", name: "Root" },
      { id: "f2", name: "Child" },
      { id: "f3", name: "Grandchild" },
    ]);
  });

  it("returns empty array for non-existent folder", () => {
    expect(getFolderBreadcrumb([], "nonexistent")).toEqual([]);
  });
});
