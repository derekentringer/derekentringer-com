import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalFileDeleteDialog } from "../components/LocalFileDeleteDialog.tsx";

describe("LocalFileDeleteDialog", () => {
  it("renders the dialog title", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Delete Local File Note")).toBeInTheDocument();
  });

  it("renders the note title in quotes", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="Important Notes"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // The title is rendered with smart quotes via &ldquo; and &rdquo;
    expect(screen.getByText(/Important Notes/)).toBeInTheDocument();
  });

  it("renders Delete from NoteSync button with description", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Delete from NoteSync")).toBeInTheDocument();
    expect(screen.getByText(/Remove from NoteSync but keep the local file/)).toBeInTheDocument();
  });

  it("renders Delete Completely button with description", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Delete Completely")).toBeInTheDocument();
    expect(screen.getByText(/Remove from NoteSync and delete the local file/)).toBeInTheDocument();
  });

  it("renders Cancel button", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onDeleteFromNoteSync when Delete from NoteSync is clicked", async () => {
    const onDeleteFromNoteSync = vi.fn();

    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={onDeleteFromNoteSync}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Delete from NoteSync"));
    expect(onDeleteFromNoteSync).toHaveBeenCalledTimes(1);
  });

  it("calls onDeleteCompletely when Delete Completely is clicked", async () => {
    const onDeleteCompletely = vi.fn();

    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={onDeleteCompletely}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Delete Completely"));
    expect(onDeleteCompletely).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();

    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("styles Delete Completely button with destructive class", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const deleteBtn = screen.getByText("Delete Completely").closest("button")!;
    expect(deleteBtn.className).toContain("text-destructive");
    expect(deleteBtn.className).toContain("border-destructive");
  });

  it("has cursor-pointer on all buttons", () => {
    render(
      <LocalFileDeleteDialog
        noteTitle="My Note"
        onDeleteFromNoteSync={vi.fn()}
        onDeleteCompletely={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const deleteFromBtn = screen.getByText("Delete from NoteSync").closest("button")!;
    const deleteCompletelyBtn = screen.getByText("Delete Completely").closest("button")!;
    const cancelBtn = screen.getByText("Cancel").closest("button")!;

    expect(deleteFromBtn.className).toContain("cursor-pointer");
    expect(deleteCompletelyBtn.className).toContain("cursor-pointer");
    expect(cancelBtn.className).toContain("cursor-pointer");
  });
});
