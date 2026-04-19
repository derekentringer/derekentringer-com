import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportChoiceDialog } from "../components/ImportChoiceDialog.tsx";

describe("ImportChoiceDialog", () => {
  it("renders the dialog title", () => {
    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Import Files")).toBeInTheDocument();
  });

  it("displays the file count", () => {
    render(
      <ImportChoiceDialog
        fileNames={["a.md", "b.txt"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 file\(s\)/)).toBeInTheDocument();
  });

  it("renders file names in the list", () => {
    render(
      <ImportChoiceDialog
        fileNames={["first.md", "second.txt", "third.markdown"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("first.md")).toBeInTheDocument();
    expect(screen.getByText("second.txt")).toBeInTheDocument();
    expect(screen.getByText("third.markdown")).toBeInTheDocument();
  });

  it("truncates file list to 5 and shows remaining count", () => {
    const fileNames = ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md", "g.md"];

    render(
      <ImportChoiceDialog
        fileNames={fileNames}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("e.md")).toBeInTheDocument();
    expect(screen.queryByText("f.md")).not.toBeInTheDocument();
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });

  it("renders Import to NoteSync button with description", () => {
    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Import to NoteSync")).toBeInTheDocument();
    expect(screen.getByText(/Copy file contents into NoteSync. The original files will not be tracked./)).toBeInTheDocument();
  });

  it("renders Start Managing Locally button with description", () => {
    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Start Managing Locally")).toBeInTheDocument();
    expect(screen.getByText(/Track and sync files from their current location/)).toBeInTheDocument();
  });

  it("renders Cancel button", () => {
    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onImportToNoteSync when Import to NoteSync is clicked", async () => {
    const onImportToNoteSync = vi.fn();

    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={onImportToNoteSync}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Import to NoteSync"));
    expect(onImportToNoteSync).toHaveBeenCalledTimes(1);
  });

  it("calls onKeepLocal when Start Managing Locally is clicked", async () => {
    const onKeepLocal = vi.fn();

    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={onKeepLocal}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Start Managing Locally"));
    expect(onKeepLocal).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();

    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("has cursor-pointer on all buttons", () => {
    render(
      <ImportChoiceDialog
        fileNames={["note.md"]}
        onImportToNoteSync={vi.fn()}
        onKeepLocal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const importBtn = screen.getByText("Import to NoteSync").closest("button")!;
    const keepLocalBtn = screen.getByText("Start Managing Locally").closest("button")!;
    const cancelBtn = screen.getByText("Cancel").closest("button")!;

    expect(importBtn.className).toContain("cursor-pointer");
    expect(keepLocalBtn.className).toContain("cursor-pointer");
    expect(cancelBtn.className).toContain("cursor-pointer");
  });
});
