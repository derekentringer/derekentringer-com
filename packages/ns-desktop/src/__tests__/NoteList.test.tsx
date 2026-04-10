import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { NoteList } from "../components/NoteList.tsx";
import type { Note, NoteSearchResult } from "@derekentringer/ns-shared";
import type { LocalFileStatus } from "../lib/localFileService.ts";

function DndWrapper({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor));
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

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
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
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
      <DndWrapper>
        <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} sortByManual={false} />
      </DndWrapper>,
    );

    expect(screen.getByText("First Note")).toBeInTheDocument();
    expect(screen.getByText("Second Note")).toBeInTheDocument();
  });

  it("shows 'Untitled' for notes with empty title", () => {
    const notes = [makeNote({ id: "1", title: "" })];

    render(
      <DndWrapper>
        <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} sortByManual={false} />
      </DndWrapper>,
    );

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("calls onSelect when a note is clicked", async () => {
    const onSelect = vi.fn();
    const note = makeNote({ id: "1", title: "Click Me" });

    render(
      <DndWrapper>
        <NoteList notes={[note]} selectedId={null} onSelect={onSelect} sortByManual={false} />
      </DndWrapper>,
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
      <DndWrapper>
        <NoteList notes={notes} selectedId="1" onSelect={vi.fn()} sortByManual={false} />
      </DndWrapper>,
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
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={onDeleteNote}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Right Click Me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows confirm dialog when Delete is clicked from context menu", async () => {
    const note = makeNote({ id: "1", title: "My Special Note" });
    const onDeleteNote = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={onDeleteNote}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("My Special Note");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Delete"));

    expect(screen.getByText("Delete Note")).toBeInTheDocument();
    expect(screen.getAllByText("My Special Note")).toHaveLength(2);
  });

  it("calls onDeleteNote after confirming deletion", async () => {
    const note = makeNote({ id: "note-123", title: "Confirm Delete" });
    const onDeleteNote = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={onDeleteNote}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Confirm Delete");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Delete"));

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
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={onDeleteNote}
          sortByManual={false}
        />
      </DndWrapper>,
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
      <DndWrapper>
        <NoteList notes={[]} selectedId={null} onSelect={vi.fn()} sortByManual={false} />
      </DndWrapper>,
    );
    expect(container).toBeTruthy();
  });

  // Search results tests
  it("displays search results with headlines", () => {
    const searchResults: NoteSearchResult[] = [
      {
        ...makeNote({ id: "1", title: "Search Hit" }),
        headline: "found <mark>term</mark> here",
      },
    ];

    render(
      <DndWrapper>
        <NoteList
          notes={[]}
          selectedId={null}
          onSelect={vi.fn()}
          searchResults={searchResults}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    expect(screen.getByText("Search Hit")).toBeInTheDocument();
    // The headline is rendered via dangerouslySetInnerHTML
    const snippet = document.querySelector(".search-highlight");
    expect(snippet).toBeInTheDocument();
    expect(snippet?.innerHTML).toContain("<mark>term</mark>");
  });

  it("prefers searchResults over notes when provided", () => {
    const notes = [makeNote({ id: "1", title: "Regular Note" })];
    const searchResults: NoteSearchResult[] = [
      { ...makeNote({ id: "2", title: "Search Result" }), headline: "match" },
    ];

    render(
      <DndWrapper>
        <NoteList
          notes={notes}
          selectedId={null}
          onSelect={vi.fn()}
          searchResults={searchResults}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    expect(screen.getByText("Search Result")).toBeInTheDocument();
    expect(screen.queryByText("Regular Note")).not.toBeInTheDocument();
  });

  // Drag handle tests
  it("shows drag handle when sortByManual is true", () => {
    const notes = [makeNote({ id: "1", title: "Manual Sort Note" })];

    render(
      <DndWrapper>
        <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} sortByManual={true} />
      </DndWrapper>,
    );

    const handle = screen.getByTitle("Drag to reorder");
    expect(handle).toBeInTheDocument();
  });

  it("hides drag handle when sortByManual is false", () => {
    const notes = [makeNote({ id: "1", title: "Auto Sort Note" })];

    render(
      <DndWrapper>
        <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} sortByManual={false} />
      </DndWrapper>,
    );

    expect(screen.queryByTitle("Drag to reorder")).not.toBeInTheDocument();
  });

  // Favorite tests
  it("shows star indicator for favorite notes", () => {
    const notes = [
      makeNote({ id: "1", title: "Fav Note", favorite: true }),
      makeNote({ id: "2", title: "Normal Note", favorite: false }),
    ];

    render(
      <DndWrapper>
        <NoteList notes={notes} selectedId={null} onSelect={vi.fn()} sortByManual={false} />
      </DndWrapper>,
    );

    expect(screen.getByText("★")).toBeInTheDocument();
    // Only one star for the favorite note
    expect(screen.getAllByText("★")).toHaveLength(1);
  });

  it("shows Favorite/Unfavorite in context menu when onToggleFavorite is provided", async () => {
    const note = makeNote({ id: "1", title: "Fav Menu", favorite: false });
    const onToggleFavorite = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onToggleFavorite={onToggleFavorite}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Fav Menu");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Favorite")).toBeInTheDocument();
  });

  it("shows 'Unfavorite' for already-favorited notes in context menu", async () => {
    const note = makeNote({ id: "1", title: "Already Fav", favorite: true });
    const onToggleFavorite = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onToggleFavorite={onToggleFavorite}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Already Fav");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Unfavorite")).toBeInTheDocument();
  });

  it("calls onToggleFavorite with correct args when Favorite is clicked", async () => {
    const note = makeNote({ id: "note-fav", title: "Toggle Fav", favorite: false });
    const onToggleFavorite = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onToggleFavorite={onToggleFavorite}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Toggle Fav");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Favorite"));

    expect(onToggleFavorite).toHaveBeenCalledWith("note-fav", true);
  });

  // Double-click tests
  it("calls onDoubleClick when a note is double-clicked", async () => {
    const onDoubleClick = vi.fn();
    const note = makeNote({ id: "1", title: "Double Click Me" });

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDoubleClick={onDoubleClick}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    await userEvent.dblClick(screen.getByText("Double Click Me"));
    expect(onDoubleClick).toHaveBeenCalledWith(note);
  });

  it("does not error when onDoubleClick is not provided", async () => {
    const note = makeNote({ id: "1", title: "No Handler" });

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    // Should not throw
    await userEvent.dblClick(screen.getByText("No Handler"));
  });

  // ---------------------------------------------------------------------------
  // Local file indicator dot tests
  // ---------------------------------------------------------------------------

  it("shows green indicator dot for synced local file", () => {
    const notes = [makeNote({ id: "1", title: "Synced Note", isLocalFile: true })];
    const statuses = new Map<string, LocalFileStatus>([["1", "synced"]]);

    render(
      <DndWrapper>
        <NoteList
          notes={notes}
          selectedId={null}
          onSelect={vi.fn()}
          sortByManual={false}
          localFileStatuses={statuses}
        />
      </DndWrapper>,
    );

    const indicator = screen.getByTitle("Local file in sync");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("bg-green-500");
  });

  it("shows amber indicator dot for cloud_newer status", () => {
    const notes = [makeNote({ id: "1", title: "Cloud Newer Note", isLocalFile: true })];
    const statuses = new Map<string, LocalFileStatus>([["1", "cloud_newer"]]);

    render(
      <DndWrapper>
        <NoteList
          notes={notes}
          selectedId={null}
          onSelect={vi.fn()}
          sortByManual={false}
          localFileStatuses={statuses}
        />
      </DndWrapper>,
    );

    const indicator = screen.getByTitle("Cloud version is newer");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("bg-amber-500");
  });

  it("shows amber indicator dot for external_change status", () => {
    const notes = [makeNote({ id: "1", title: "Changed Note", isLocalFile: true })];
    const statuses = new Map<string, LocalFileStatus>([["1", "external_change"]]);

    render(
      <DndWrapper>
        <NoteList
          notes={notes}
          selectedId={null}
          onSelect={vi.fn()}
          sortByManual={false}
          localFileStatuses={statuses}
        />
      </DndWrapper>,
    );

    const indicator = screen.getByTitle("File changed externally");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("bg-amber-500");
  });

  it("shows red indicator dot for missing local file", () => {
    const notes = [makeNote({ id: "1", title: "Missing Note", isLocalFile: true })];
    const statuses = new Map<string, LocalFileStatus>([["1", "missing"]]);

    render(
      <DndWrapper>
        <NoteList
          notes={notes}
          selectedId={null}
          onSelect={vi.fn()}
          sortByManual={false}
          localFileStatuses={statuses}
        />
      </DndWrapper>,
    );

    const indicator = screen.getByTitle("Local file missing");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("bg-red-500");
  });

  it("does not show indicator dot when no localFileStatuses provided", () => {
    const notes = [makeNote({ id: "1", title: "No Status Note" })];

    render(
      <DndWrapper>
        <NoteList
          notes={notes}
          selectedId={null}
          onSelect={vi.fn()}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    expect(screen.queryByTitle("Local file in sync")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Local file missing")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Cloud version is newer")).not.toBeInTheDocument();
    expect(screen.queryByTitle("File changed externally")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Local file context menu items
  // ---------------------------------------------------------------------------

  it("shows 'Save As Local File' in context menu for non-local notes", async () => {
    const note = makeNote({ id: "1", title: "Cloud Note", isLocalFile: false });
    const onSaveAsLocalFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onSaveAsLocalFile={onSaveAsLocalFile}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Cloud Note");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Save As Local File")).toBeInTheDocument();
  });

  it("calls onSaveAsLocalFile when Save As Local File is clicked", async () => {
    const note = makeNote({ id: "note-save", title: "Save Me", isLocalFile: false });
    const onSaveAsLocalFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onSaveAsLocalFile={onSaveAsLocalFile}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Save Me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Save As Local File"));

    expect(onSaveAsLocalFile).toHaveBeenCalledWith("note-save");
  });

  it("shows 'Unlink Local File' in context menu for local file notes", async () => {
    const note = makeNote({ id: "1", title: "Local Note", isLocalFile: true });
    const onUnlinkLocalFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onUnlinkLocalFile={onUnlinkLocalFile}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Local Note");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Unlink Local File")).toBeInTheDocument();
  });

  it("calls onUnlinkLocalFile when Unlink Local File is clicked", async () => {
    const note = makeNote({ id: "note-unlink", title: "Unlink Me", isLocalFile: true });
    const onUnlinkLocalFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onUnlinkLocalFile={onUnlinkLocalFile}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Unlink Me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Unlink Local File"));

    expect(onUnlinkLocalFile).toHaveBeenCalledWith("note-unlink");
  });

  it("shows 'Save to File' in context menu for cloud_newer local file notes", async () => {
    const note = makeNote({ id: "1", title: "Newer Cloud", isLocalFile: true });
    const statuses = new Map<string, LocalFileStatus>([["1", "cloud_newer"]]);
    const onSaveToFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onSaveToFile={onSaveToFile}
          localFileStatuses={statuses}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Newer Cloud");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Save to File")).toBeInTheDocument();
  });

  it("shows 'Use Local Version' in context menu for external_change local file notes", async () => {
    const note = makeNote({ id: "1", title: "Changed Externally", isLocalFile: true });
    const statuses = new Map<string, LocalFileStatus>([["1", "external_change"]]);
    const onUseLocalVersion = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onUseLocalVersion={onUseLocalVersion}
          localFileStatuses={statuses}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Changed Externally");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Use Local Version")).toBeInTheDocument();
  });

  it("shows 'View Diff' in context menu for cloud_newer local file notes", async () => {
    const note = makeNote({ id: "1", title: "Diff Cloud", isLocalFile: true });
    const statuses = new Map<string, LocalFileStatus>([["1", "cloud_newer"]]);
    const onViewDiff = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onViewDiff={onViewDiff}
          localFileStatuses={statuses}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Diff Cloud");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("View Diff")).toBeInTheDocument();
  });

  it("shows 'View Diff' in context menu for external_change local file notes", async () => {
    const note = makeNote({ id: "1", title: "Diff External", isLocalFile: true });
    const statuses = new Map<string, LocalFileStatus>([["1", "external_change"]]);
    const onViewDiff = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onViewDiff={onViewDiff}
          localFileStatuses={statuses}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Diff External");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("View Diff")).toBeInTheDocument();
  });

  it("does not show 'Save As Local File' for local file notes", async () => {
    const note = makeNote({ id: "1", title: "Already Local", isLocalFile: true });
    const onSaveAsLocalFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onSaveAsLocalFile={onSaveAsLocalFile}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Already Local");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.queryByText("Save As Local File")).not.toBeInTheDocument();
  });

  it("does not show 'Unlink Local File' for non-local notes", async () => {
    const note = makeNote({ id: "1", title: "Cloud Only", isLocalFile: false });
    const onUnlinkLocalFile = vi.fn();

    render(
      <DndWrapper>
        <NoteList
          notes={[note]}
          selectedId={null}
          onSelect={vi.fn()}
          onDeleteNote={vi.fn()}
          onUnlinkLocalFile={onUnlinkLocalFile}
          sortByManual={false}
        />
      </DndWrapper>,
    );

    const button = screen.getByText("Cloud Only");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.queryByText("Unlink Local File")).not.toBeInTheDocument();
  });
});
