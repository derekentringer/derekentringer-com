import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CrossBoundaryMoveDialog } from "../components/CrossBoundaryMoveDialog.tsx";

describe("CrossBoundaryMoveDialog", () => {
  describe("direction = toManaged", () => {
    it("shows the managed-notebook warning and move button", () => {
      render(
        <CrossBoundaryMoveDialog
          direction="toManaged"
          folderName="Work"
          affectedFolderCount={3}
          affectedNoteCount={12}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText(/Move into managed notebook/i)).toBeInTheDocument();
      expect(screen.getByText(/Managed notebook\./i)).toBeInTheDocument();
      expect(
        screen.getByText(/written to the managing desktop on its next sync/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/3 folders and 12 notes/)).toBeInTheDocument();
    });

    it("confirm invokes onConfirm", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(
        <CrossBoundaryMoveDialog
          direction="toManaged"
          folderName="Work"
          affectedFolderCount={1}
          affectedNoteCount={0}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Move" }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe("direction = toUnmanaged", () => {
    it("shows the unmanaged-notebook warning and trash wording", () => {
      render(
        <CrossBoundaryMoveDialog
          direction="toUnmanaged"
          folderName="Personal"
          affectedFolderCount={1}
          affectedNoteCount={1}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText(/Move out of managed notebook/i)).toBeInTheDocument();
      expect(screen.getByText(/Unmanaged notebook\./i)).toBeInTheDocument();
      expect(
        screen.getByText(/moved to the OS trash on the managing desktop/i),
      ).toBeInTheDocument();
      // singular pluralization check
      expect(screen.getByText(/1 folder and 1 note/)).toBeInTheDocument();
    });
  });

  it("cancel invokes onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <CrossBoundaryMoveDialog
        direction="toManaged"
        folderName="X"
        affectedFolderCount={0}
        affectedNoteCount={0}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Escape key invokes onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <CrossBoundaryMoveDialog
        direction="toManaged"
        folderName="X"
        affectedFolderCount={0}
        affectedNoteCount={0}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
