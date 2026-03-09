import { vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@derekentringer/ns-shared";

// Mock db module
const mockFetchNotes = vi.fn().mockResolvedValue([]);
const mockFetchFolders = vi.fn().mockResolvedValue([]);
const mockFetchTags = vi.fn().mockResolvedValue([]);
const mockFetchTrash = vi.fn().mockResolvedValue([]);
const mockInitFts = vi.fn().mockResolvedValue(undefined);
const mockBulkHardDelete = vi.fn().mockResolvedValue(0);
const mockEmptyTrash = vi.fn().mockResolvedValue(0);
const mockPurgeOldTrash = vi.fn().mockResolvedValue(0);
const mockHardDeleteNote = vi.fn().mockResolvedValue(undefined);
const mockRestoreNote = vi.fn().mockResolvedValue(undefined);
const mockCreateNote = vi.fn().mockResolvedValue({
  id: "new",
  title: "",
  content: "",
  folder: null,
  folderId: null,
  folderPath: null,
  tags: [],
  summary: null,
  favorite: false,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
});

vi.mock("../lib/db.ts", () => ({
  fetchNotes: (...args: unknown[]) => mockFetchNotes(...args),
  fetchNoteById: vi.fn().mockResolvedValue(null),
  createNote: (...args: unknown[]) => mockCreateNote(...args),
  updateNote: vi.fn().mockResolvedValue({}),
  softDeleteNote: vi.fn().mockResolvedValue(undefined),
  hardDeleteNote: (...args: unknown[]) => mockHardDeleteNote(...args),
  searchNotes: vi.fn().mockResolvedValue([]),
  fetchFolders: (...args: unknown[]) => mockFetchFolders(...args),
  createFolder: vi.fn().mockResolvedValue({}),
  renameFolder: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  fetchTags: (...args: unknown[]) => mockFetchTags(...args),
  renameTag: vi.fn().mockResolvedValue(undefined),
  deleteTag: vi.fn().mockResolvedValue(undefined),
  fetchTrash: (...args: unknown[]) => mockFetchTrash(...args),
  restoreNote: (...args: unknown[]) => mockRestoreNote(...args),
  bulkHardDelete: (...args: unknown[]) => mockBulkHardDelete(...args),
  emptyTrash: (...args: unknown[]) => mockEmptyTrash(...args),
  purgeOldTrash: (...args: unknown[]) => mockPurgeOldTrash(...args),
  initFts: (...args: unknown[]) => mockInitFts(...args),
  reorderNotes: vi.fn().mockResolvedValue(undefined),
  moveFolderParent: vi.fn().mockResolvedValue(undefined),
}));

// Mock useEditorSettings
vi.mock("../hooks/useEditorSettings.ts", () => ({
  useEditorSettings: () => ({
    settings: {
      defaultViewMode: "editor",
      showLineNumbers: true,
      wordWrap: true,
      tabSize: 2,
      editorFontSize: 14,
      autoSaveDelay: 1000,
      theme: "dark",
      accentColor: "blue",
    },
  }),
  resolveAccentColor: () => "#3b82f6",
}));

// Mock useResizable
vi.mock("../hooks/useResizable.ts", () => ({
  useResizable: () => ({
    size: 256,
    isDragging: false,
    onPointerDown: vi.fn(),
  }),
}));

// Mock MarkdownEditor (uses CodeMirror which doesn't work in jsdom)
vi.mock("../components/MarkdownEditor.tsx", () => ({
  MarkdownEditor: vi.fn(() => <div data-testid="mock-editor" />),
}));

// Mock MarkdownPreview (render content so tests can verify read-only display)
vi.mock("../components/MarkdownPreview.tsx", () => ({
  MarkdownPreview: vi.fn(({ content }: { content: string }) => (
    <div data-testid="mock-preview">{content}</div>
  )),
}));

// Mock @dnd-kit
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
  useDroppable: vi.fn().mockReturnValue({ isOver: false, setNodeRef: vi.fn() }),
  useDraggable: vi.fn().mockReturnValue({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn().mockReturnValue({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn().mockReturnValue("") } },
}));

import { NotesPage } from "../pages/NotesPage.tsx";

function makeTrashNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "trash-1",
    title: "Trashed Note",
    content: "content",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: "2024-06-01T00:00:00.000Z",
    ...overrides,
  };
}

async function renderAndOpenTrash(trashNotes: Note[] = []) {
  mockFetchTrash.mockResolvedValue(trashNotes);
  const user = userEvent.setup();

  render(<NotesPage />);

  // Wait for initial load
  await screen.findByText("NoteSync");

  // Click trash button
  const trashButton = screen.getByTitle("Trash");
  await user.click(trashButton);

  // Wait for trash view (Back button appears when in trash view)
  await screen.findByText("Back");

  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("TrashView — bulk operations", () => {
  it("renders select-all checkbox with item count", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    await renderAndOpenTrash(notes);

    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("toggles individual trash item selection", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    const checkbox = screen.getByLabelText("Select Note A");
    await user.click(checkbox);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("select-all selects all items", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    const selectAll = screen.getByLabelText("Select all");
    await user.click(selectAll);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("select-all deselects when all are already selected", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    // Select all
    const selectAll = screen.getByLabelText("Select all");
    await user.click(selectAll);
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // Deselect all
    await user.click(selectAll);
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("shows 'Delete Selected (N)' when items selected", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByLabelText("Select Note A"));

    expect(screen.getByText("Delete Selected (1)")).toBeInTheDocument();
  });

  it("shows 'Delete All' when no items selected", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
    ];
    await renderAndOpenTrash(notes);

    expect(screen.getByText("Delete All")).toBeInTheDocument();
  });

  it("confirmation dialog appears on Delete All click", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByText("Delete All"));

    expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    expect(screen.getByText(/Permanently delete all 2 trashed notes/)).toBeInTheDocument();
  });

  it("confirmation dialog appears on Delete Selected click", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByLabelText("Select Note A"));
    await user.click(screen.getByText("Delete Selected (1)"));

    expect(screen.getByText("Delete Selected")).toBeInTheDocument();
    expect(screen.getByText(/Permanently delete 1 selected note\?/)).toBeInTheDocument();
  });

  it("calls emptyTrash after confirming empty all", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByText("Delete All"));
    // Click the "Delete" button in the dialog
    const dialog = screen.getByText("Empty Trash").closest("div")!.parentElement!;
    const deleteBtn = within(dialog).getAllByText("Delete").find((el) => el.tagName === "BUTTON")!;
    await user.click(deleteBtn);

    expect(mockEmptyTrash).toHaveBeenCalledTimes(1);
  });

  it("calls bulkHardDelete after confirming selected delete", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByLabelText("Select Note A"));
    await user.click(screen.getByText("Delete Selected (1)"));

    const dialog = screen.getByText("Delete Selected").closest("div")!.parentElement!;
    const deleteBtn = within(dialog).getAllByText("Delete").find((el) => el.tagName === "BUTTON")!;
    await user.click(deleteBtn);

    expect(mockBulkHardDelete).toHaveBeenCalledWith(["t1"]);
  });

  it("cancel hides confirmation dialog", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByText("Delete All"));
    expect(screen.getByText("Empty Trash")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Empty Trash")).not.toBeInTheDocument();
  });

  it("shows 'Trash is empty' when no trashed notes", async () => {
    await renderAndOpenTrash([]);

    expect(screen.getByText("Trash is empty")).toBeInTheDocument();
    expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
  });

  it("does not show bulk actions when trash is empty", async () => {
    await renderAndOpenTrash([]);

    expect(screen.queryByText("Delete All")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
  });
});

describe("TrashView — note selection & editor", () => {
  it("clicking a trashed note title shows read-only content in editor area", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "My Trashed Note", content: "Hello world" }),
    ];
    const user = await renderAndOpenTrash(notes);

    // Click the note title button
    await user.click(screen.getByRole("button", { name: "My Trashed Note" }));

    // Should show read-only title as a div (not an input)
    const titleElements = screen.getAllByText("My Trashed Note");
    // One in sidebar list, one in editor title area
    expect(titleElements.length).toBeGreaterThanOrEqual(2);
    // The editor title should be a div, not an input
    expect(screen.queryByPlaceholderText("Note title")).not.toBeInTheDocument();

    // Should show read-only content via MarkdownPreview
    expect(screen.getByTestId("mock-preview")).toHaveTextContent("Hello world");

    // Should NOT show the editable editor
    expect(screen.queryByTestId("mock-editor")).not.toBeInTheDocument();
  });

  it("trash toolbar shows formatted deletion date", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A", deletedAt: "2024-06-15T10:30:00.000Z" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByRole("button", { name: "Note A" }));

    // Should show the formatted date
    const expectedDate = new Date("2024-06-15T10:30:00.000Z").toLocaleDateString();
    expect(screen.getByText(`Deleted ${expectedDate}`)).toBeInTheDocument();
  });

  it("trash toolbar Restore button calls restoreNote and clears editor", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A", content: "content A" }),
    ];
    const user = await renderAndOpenTrash(notes);

    // Select the note
    await user.click(screen.getByRole("button", { name: "Note A" }));
    expect(screen.getByTestId("mock-preview")).toBeInTheDocument();

    // Click Restore
    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(mockRestoreNote).toHaveBeenCalledWith("t1");

    // Editor should be cleared — back to placeholder
    await screen.findByText("Select a note or create a new one");
  });

  it("Delete Permanently shows inline confirmation on first click", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByRole("button", { name: "Note A" }));

    // Click Delete Permanently
    await user.click(screen.getByRole("button", { name: "Delete Permanently" }));

    // Should show inline confirmation
    expect(screen.getByText("Delete forever?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    // Should NOT have called hardDeleteNote yet
    expect(mockHardDeleteNote).not.toHaveBeenCalled();
  });

  it("confirming permanent delete calls hardDeleteNote and clears editor", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByRole("button", { name: "Note A" }));

    // First click — shows confirmation
    await user.click(screen.getByRole("button", { name: "Delete Permanently" }));

    // Second click — confirm
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mockHardDeleteNote).toHaveBeenCalledWith("t1");

    // Editor should be cleared
    await screen.findByText("Select a note or create a new one");
  });

  it("cancel hides inline permanent delete confirmation", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByRole("button", { name: "Note A" }));

    // Show confirmation
    await user.click(screen.getByRole("button", { name: "Delete Permanently" }));
    expect(screen.getByText("Delete forever?")).toBeInTheDocument();

    // Cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Confirmation should be hidden, Delete Permanently button should be back
    expect(screen.queryByText("Delete forever?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Permanently" })).toBeInTheDocument();
  });

  it("selected note is highlighted in trash list", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    const user = await renderAndOpenTrash(notes);

    await user.click(screen.getByRole("button", { name: "Note A" }));

    // The parent container of the selected note should have highlight class
    const noteBtn = screen.getByRole("button", { name: "Note A" });
    const container = noteBtn.closest("div");
    expect(container?.className).toContain("bg-accent");
    expect(container?.className).toContain("text-foreground");
  });
});

describe("TrashView — trash count badge", () => {
  it("shows trash count badge when trash has items", async () => {
    const notes = [
      makeTrashNote({ id: "t1", title: "Note A" }),
      makeTrashNote({ id: "t2", title: "Note B" }),
    ];
    mockFetchTrash.mockResolvedValue(notes);

    render(<NotesPage />);
    await screen.findByText("NoteSync");

    // Wait for trash count to load — badge should show "2"
    const trashButton = screen.getByTitle("Trash");
    await vi.waitFor(() => {
      const badge = trashButton.querySelector("span");
      expect(badge).toHaveTextContent("2");
    });
  });

  it("does not show trash count badge when trash is empty", async () => {
    mockFetchTrash.mockResolvedValue([]);

    render(<NotesPage />);
    await screen.findByText("NoteSync");

    // Wait a tick for the effect to settle
    await vi.waitFor(() => {
      const trashButton = screen.getByTitle("Trash");
      // The badge span should not exist
      const badge = trashButton.querySelector("span");
      expect(badge).toBeNull();
    });
  });
});

describe("TrashView — retention settings", () => {
  it("renders retention dropdown with correct options", async () => {
    await renderAndOpenTrash([]);

    const dropdown = screen.getByLabelText("Trash retention period");
    expect(dropdown).toBeInTheDocument();

    const options = within(dropdown).getAllByRole("option");
    expect(options).toHaveLength(6);
    expect(options[0]).toHaveTextContent("7 days");
    expect(options[1]).toHaveTextContent("14 days");
    expect(options[2]).toHaveTextContent("30 days (default)");
    expect(options[3]).toHaveTextContent("60 days");
    expect(options[4]).toHaveTextContent("90 days");
    expect(options[5]).toHaveTextContent("Never");
  });

  it("defaults to 30 days", async () => {
    await renderAndOpenTrash([]);

    const dropdown = screen.getByLabelText("Trash retention period") as HTMLSelectElement;
    expect(dropdown.value).toBe("30");
  });

  it("changes retention setting on dropdown change", async () => {
    const user = await renderAndOpenTrash([]);

    const dropdown = screen.getByLabelText("Trash retention period");
    await user.selectOptions(dropdown, "7");

    expect(localStorage.getItem("ns-desktop:trashRetentionDays")).toBe("7");
  });

  it("reads retention from localStorage", async () => {
    localStorage.setItem("ns-desktop:trashRetentionDays", "60");

    await renderAndOpenTrash([]);

    const dropdown = screen.getByLabelText("Trash retention period") as HTMLSelectElement;
    expect(dropdown.value).toBe("60");
  });

  it("calls purgeOldTrash when setting changes to a non-zero value", async () => {
    const user = await renderAndOpenTrash([]);

    const dropdown = screen.getByLabelText("Trash retention period");
    await user.selectOptions(dropdown, "14");

    expect(mockPurgeOldTrash).toHaveBeenCalledWith(14);
  });
});
