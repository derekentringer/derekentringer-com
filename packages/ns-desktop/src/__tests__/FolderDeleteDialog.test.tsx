import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderDeleteDialog } from "../components/FolderDeleteDialog.tsx";
import type { FolderInfo } from "@derekentringer/ns-shared";

function makeFolder(overrides: Partial<FolderInfo> = {}): FolderInfo {
  return {
    id: "folder-1",
    name: "Example",
    parentId: null,
    sortOrder: 0,
    favorite: false,
    count: 0,
    totalCount: 0,
    createdAt: "2026-01-01",
    children: [],
    ...overrides,
  };
}

describe("FolderDeleteDialog", () => {
  describe("managed-locally variant", () => {
    it("shows the managed warning banner and only a single Delete action", async () => {
      render(
        <FolderDeleteDialog
          folder={makeFolder({ isLocalFile: true })}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText(/Managed locally/i)).toBeInTheDocument();
      expect(
        screen.getByText(/move the folder and every file inside/i),
      ).toBeInTheDocument();
      // No reparent option — it has no on-disk analog.
      expect(
        screen.queryByText(/Move contents to parent folder/i),
      ).not.toBeInTheDocument();
    });

    it("Delete button on a managed leaf invokes recursive mode", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <FolderDeleteDialog
          folder={makeFolder({ isLocalFile: true })}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(onConfirm).toHaveBeenCalledWith("recursive");
    });

    it("Delete button on a managed folder with children also invokes recursive mode", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <FolderDeleteDialog
          folder={makeFolder({
            isLocalFile: true,
            children: [makeFolder({ id: "child", name: "sub" })],
          })}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      // Text adjusts to mention subfolders
      expect(
        screen.getByText(/All subfolders, notes, and their on-disk files/i),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(onConfirm).toHaveBeenCalledWith("recursive");
    });
  });

  describe("non-managed variant", () => {
    it("leaf folder: default confirm dialog invokes move-up mode", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <FolderDeleteDialog
          folder={makeFolder({ isLocalFile: false })}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      // No managed warning for non-managed folders.
      expect(screen.queryByText(/Managed locally/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /confirm|delete|ok/i }));
      expect(onConfirm).toHaveBeenCalledWith("move-up");
    });

    it("folder with children offers both move-up and recursive", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <FolderDeleteDialog
          folder={makeFolder({
            isLocalFile: false,
            children: [makeFolder({ id: "child", name: "sub" })],
          })}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      expect(
        screen.getByText(/Move contents to parent folder/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Delete folder and everything in it/i),
      ).toBeInTheDocument();

      await user.click(screen.getByText(/Delete folder and everything in it/i));
      expect(onConfirm).toHaveBeenCalledWith("recursive");
    });
  });
});
