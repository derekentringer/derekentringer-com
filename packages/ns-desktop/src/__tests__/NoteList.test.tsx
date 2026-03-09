import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteList } from "../components/NoteList.tsx";
import type { Note } from "@derekentringer/ns-shared";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test Note",
    content: "Some content",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("NoteList", () => {
  it("renders note titles", () => {
    const notes = [
      makeNote({ id: "1", title: "First Note" }),
      makeNote({ id: "2", title: "Second Note" }),
    ];

    render(
      <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("First Note")).toBeInTheDocument();
    expect(screen.getByText("Second Note")).toBeInTheDocument();
  });

  it("shows 'Untitled' for notes with empty title", () => {
    const notes = [makeNote({ id: "1", title: "" })];

    render(
      <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("calls onSelect when a note is clicked", async () => {
    const onSelect = vi.fn();
    const note = makeNote({ id: "1", title: "Click Me" });

    render(
      <NoteList notes={[note]} selectedId={null} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByText("Click Me"));
    expect(onSelect).toHaveBeenCalledWith(note);
  });

  it("highlights the selected note", () => {
    const notes = [
      makeNote({ id: "1", title: "Selected" }),
      makeNote({ id: "2", title: "Not Selected" }),
    ];

    render(
      <NoteList notes={notes} selectedId="1" onSelect={vi.fn()} />,
    );

    const selectedButton = screen.getByText("Selected").closest("button");
    expect(selectedButton).toHaveClass("bg-accent");

    const unselectedButton = screen.getByText("Not Selected").closest("button");
    expect(unselectedButton).not.toHaveClass("bg-accent");
  });

  it("shows context menu on right-click when onDeleteNote is provided", async () => {
    const note = makeNote({ id: "1", title: "Right Click Me" });
    const onDeleteNote = vi.fn();

    render(
      <NoteList
        notes={[note]}
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteNote={onDeleteNote}
      />,
    );

    const button = screen.getByText("Right Click Me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows confirm dialog when Delete is clicked from context menu", async () => {
    const note = makeNote({ id: "1", title: "My Special Note" });
    const onDeleteNote = vi.fn();

    render(
      <NoteList
        notes={[note]}
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteNote={onDeleteNote}
      />,
    );

    const button = screen.getByText("My Special Note");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Delete"));

    // ConfirmDialog should appear with title "Delete Note" and the note title as message
    expect(screen.getByText("Delete Note")).toBeInTheDocument();
    // The note title appears both in the list and in the dialog message
    expect(screen.getAllByText("My Special Note")).toHaveLength(2);
  });

  it("calls onDeleteNote after confirming deletion", async () => {
    const note = makeNote({ id: "note-123", title: "Confirm Delete" });
    const onDeleteNote = vi.fn();

    render(
      <NoteList
        notes={[note]}
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteNote={onDeleteNote}
      />,
    );

    // Right-click → Delete → Confirm
    const button = screen.getByText("Confirm Delete");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Delete"));

    // Now the ConfirmDialog "Delete" button
    const confirmButtons = screen.getAllByText("Delete");
    const confirmDeleteBtn = confirmButtons.find(
      (btn) => btn.closest(".fixed.inset-0") !== null,
    );
    if (confirmDeleteBtn) {
      await userEvent.click(confirmDeleteBtn);
    }

    expect(onDeleteNote).toHaveBeenCalledWith("note-123");
  });

  it("cancels deletion when Cancel is clicked in confirm dialog", async () => {
    const note = makeNote({ id: "1", title: "Cancel Delete" });
    const onDeleteNote = vi.fn();

    render(
      <NoteList
        notes={[note]}
        selectedId={null}
        onSelect={vi.fn()}
        onDeleteNote={onDeleteNote}
      />,
    );

    const button = screen.getByText("Cancel Delete");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Cancel"));

    expect(onDeleteNote).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete Note")).not.toBeInTheDocument();
  });

  it("renders empty list without errors", () => {
    const { container } = render(
      <NoteList notes={[]} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
