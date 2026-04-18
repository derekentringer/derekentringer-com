import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { FolderTree, flattenFolderTree, getFolderBreadcrumb } from "../components/FolderTree.tsx";
import type { FolderInfo } from "@derekentringer/shared/ns";

const mockFolders: FolderInfo[] = [
  {
    id: "f1",
    name: "Work",
    parentId: null,
    sortOrder: 0,
    favorite: false,
    count: 2,
    totalCount: 5,
    createdAt: "2025-01-01T00:00:00.000Z",
    children: [
      {
        id: "f2",
        name: "Projects",
        parentId: "f1",
        sortOrder: 0,
        favorite: false,
        count: 3,
        totalCount: 3,
        createdAt: "2025-01-02T00:00:00.000Z",
        children: [],
      },
    ],
  },
  {
    id: "f3",
    name: "Personal",
    parentId: null,
    sortOrder: 1,
    favorite: false,
    count: 1,
    totalCount: 1,
    createdAt: "2025-01-03T00:00:00.000Z",
    children: [],
  },
];

function DndWrapper({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

function renderFolderTree(
  overrides: Partial<React.ComponentProps<typeof FolderTree>> = {},
) {
  const defaultProps = {
    folders: mockFolders,
    activeFolder: null,
    totalNotes: 10,
    onSelectFolder: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onMoveFolder: vi.fn(),
    ...overrides,
  };
  return render(
    <DndWrapper>
      <FolderTree {...defaultProps} />
    </DndWrapper>,
  );
}

describe("FolderTree", () => {
  it("renders All Notes and Unfiled", () => {
    renderFolderTree();

    expect(screen.getByText("All Notes")).toBeInTheDocument();
    expect(screen.getByText("Unfiled")).toBeInTheDocument();
  });

  it("renders root folders", () => {
    renderFolderTree();

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("shows totalCount for folders", () => {
    renderFolderTree();

    // Work has totalCount 5, Personal has 1
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows disclosure triangle for folders with children", () => {
    renderFolderTree();

    // Work has children, should show triangle
    const workButton = screen.getByText("Work").closest("button")!;
    const triangle = workButton.querySelector("span");
    expect(triangle).toBeTruthy();
  });

  it("toggles expand/collapse on triangle click", async () => {
    const user = userEvent.setup();
    renderFolderTree();

    // Projects should be visible (root folders default expanded)
    expect(screen.getByText("Projects")).toBeInTheDocument();

    // Click the collapse triangle for Work
    const triangles = screen.getAllByText("\u25BC");
    await user.click(triangles[0]);

    // Projects should be hidden now
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
  });

  it("clicking folder calls onSelectFolder with folder ID", async () => {
    const onSelectFolder = vi.fn();
    const user = userEvent.setup();
    renderFolderTree({ onSelectFolder });

    await user.click(screen.getByText("Work"));

    expect(onSelectFolder).toHaveBeenCalledWith("f1");
  });

  it("clicking All Notes calls onSelectFolder with null", async () => {
    const onSelectFolder = vi.fn();
    const user = userEvent.setup();
    renderFolderTree({ onSelectFolder });

    await user.click(screen.getByText("All Notes"));

    expect(onSelectFolder).toHaveBeenCalledWith(null);
  });

  it("clicking Unfiled calls onSelectFolder with __unfiled__", async () => {
    const onSelectFolder = vi.fn();
    const user = userEvent.setup();
    renderFolderTree({ onSelectFolder });

    await user.click(screen.getByText("Unfiled"));

    expect(onSelectFolder).toHaveBeenCalledWith("__unfiled__");
  });

  it("highlights active folder", () => {
    renderFolderTree({ activeFolder: "f1" });

    const workButton = screen.getByText("Work").closest("button")!;
    expect(workButton.className).toContain("bg-accent");
  });

  it("shows context menu on right-click", async () => {
    const user = userEvent.setup();
    renderFolderTree();

    const workButton = screen.getByText("Work").closest("button")!;
    await user.pointer({ target: workButton, keys: "[MouseRight]" });

    expect(screen.getByText("New Subfolder")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});

describe("flattenFolderTree", () => {
  it("flattens tree with indentation", () => {
    const result = flattenFolderTree(mockFolders);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: "f1",
      name: "Work",
      depth: 0,
      displayName: "Work",
    });
    expect(result[1]).toEqual({
      id: "f2",
      name: "Projects",
      depth: 1,
      displayName: "\u00B7\u00B7 Projects",
    });
    expect(result[2]).toEqual({
      id: "f3",
      name: "Personal",
      depth: 0,
      displayName: "Personal",
    });
  });
});

describe("FolderDeleteDialog — managed-locally warning (Phase 1.6)", () => {
  async function openDeleteDialog(folder: FolderInfo) {
    const user = userEvent.setup();
    const onDeleteFolder = vi.fn();
    renderFolderTree({
      folders: [folder],
      onDeleteFolder,
    });
    // Open context menu on the folder
    const folderButton = screen.getByText(folder.name).closest("button")!;
    await user.pointer({ keys: "[MouseRight>]", target: folderButton });
    // Click "Delete"
    const deleteMenuItem = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteMenuItem);
    return { user, onDeleteFolder };
  }

  it("no warning for an unmanaged folder with no children", async () => {
    await openDeleteDialog({
      id: "f-leaf",
      name: "Regular",
      parentId: null,
      sortOrder: 0,
      favorite: false,
      isLocalFile: false,
      count: 0,
      totalCount: 0,
      createdAt: "2025-01-01",
      children: [],
    });

    expect(screen.queryByText(/Managed on a desktop/i)).not.toBeInTheDocument();
  });

  it("shows warning for a managed leaf folder and only offers recursive delete", async () => {
    await openDeleteDialog({
      id: "f-managed",
      name: "Managed",
      parentId: null,
      sortOrder: 0,
      favorite: false,
      isLocalFile: true,
      count: 0,
      totalCount: 0,
      createdAt: "2025-01-01",
      children: [],
    });

    expect(screen.getByText(/Managed on a desktop/i)).toBeInTheDocument();
    expect(
      screen.getByText(/move the folder and every file inside/i),
    ).toBeInTheDocument();
    // Managed variant never exposes the "move contents to parent" option
    // because there's no on-disk analog for it.
    expect(
      screen.queryByText(/Move contents to parent folder/i),
    ).not.toBeInTheDocument();
  });

  it("managed folder with children: still only offers recursive delete (no move-up)", async () => {
    await openDeleteDialog({
      id: "f-managed-parent",
      name: "ManagedWithKids",
      parentId: null,
      sortOrder: 0,
      favorite: false,
      isLocalFile: true,
      count: 0,
      totalCount: 1,
      createdAt: "2025-01-01",
      children: [
        {
          id: "f-child",
          name: "Child",
          parentId: "f-managed-parent",
          sortOrder: 0,
          favorite: false,
          isLocalFile: true,
          count: 1,
          totalCount: 1,
          createdAt: "2025-01-02",
          children: [],
        },
      ],
    });

    expect(screen.getByText(/Managed on a desktop/i)).toBeInTheDocument();
    // No reparent option for managed folders — it has no on-disk meaning.
    expect(
      screen.queryByText(/Move contents to parent folder/i),
    ).not.toBeInTheDocument();
    // Text explicitly mentions subfolders since the folder has children.
    expect(
      screen.getByText(/All subfolders, notes, and their on-disk files/i),
    ).toBeInTheDocument();
  });

  it("managed folder Delete button invokes recursive mode", async () => {
    const user = userEvent.setup();
    const onDeleteFolder = vi.fn();
    renderFolderTree({
      folders: [
        {
          id: "f-managed",
          name: "Managed",
          parentId: null,
          sortOrder: 0,
          favorite: false,
          isLocalFile: true,
          count: 0,
          totalCount: 0,
          createdAt: "2025-01-01",
          children: [],
        },
      ],
      onDeleteFolder,
    });
    const folderButton = screen.getByText("Managed").closest("button")!;
    await user.pointer({ keys: "[MouseRight>]", target: folderButton });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    // Confirm dialog Delete button
    const dialogDelete = screen
      .getAllByRole("button", { name: "Delete" })
      .find((b) => b.className.includes("bg-destructive"));
    expect(dialogDelete).toBeDefined();
    await user.click(dialogDelete!);

    expect(onDeleteFolder).toHaveBeenCalledWith("f-managed", "recursive");
  });
});

describe("getFolderBreadcrumb", () => {
  it("returns path from root to target folder", () => {
    const result = getFolderBreadcrumb(mockFolders, "f2");

    expect(result).toEqual([
      { id: "f1", name: "Work" },
      { id: "f2", name: "Projects" },
    ]);
  });

  it("returns single item for root folder", () => {
    const result = getFolderBreadcrumb(mockFolders, "f1");

    expect(result).toEqual([{ id: "f1", name: "Work" }]);
  });

  it("returns empty array for unknown folder", () => {
    const result = getFolderBreadcrumb(mockFolders, "nonexistent");

    expect(result).toEqual([]);
  });
});
