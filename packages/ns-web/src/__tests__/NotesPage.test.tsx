import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotesPage } from "../pages/NotesPage.tsx";

vi.mock("../components/MarkdownEditor.tsx", () => ({
  MarkdownEditor: React.forwardRef(function MockEditor(
    {
      value,
      onChange,
      onSave,
    }: {
      value: string;
      onChange: (v: string) => void;
      onSave?: () => void;
      placeholder?: string;
      className?: string;
      showLineNumbers?: boolean;
    },
    _ref: React.Ref<unknown>,
  ) {
    return (
      <textarea
        data-testid="markdown-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            onSave?.();
          }
        }}
      />
    );
  }),
}));

const mockFetchNotes = vi.fn();
const mockCreateNote = vi.fn();
const mockUpdateNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockFetchTrash = vi.fn();
const mockRestoreNote = vi.fn();
const mockPermanentDeleteNote = vi.fn();
const mockFetchFolders = vi.fn();
const mockCreateFolderApi = vi.fn();
const mockReorderNotes = vi.fn();
const mockRenameFolderApi = vi.fn();
const mockDeleteFolderApi = vi.fn();
const mockMoveFolderApi = vi.fn();
const mockReorderFoldersApi = vi.fn();
const mockFetchTags = vi.fn();
const mockRenameTagApi = vi.fn();
const mockDeleteTagApi = vi.fn();
const mockEmptyTrash = vi.fn();
const mockFetchNoteTitles = vi.fn();
const mockFetchBacklinks = vi.fn();
const mockFetchNote = vi.fn();
const mockFetchVersions = vi.fn();
const mockFetchVersion = vi.fn();
const mockRestoreVersion = vi.fn();
const mockFetchFavoriteNotes = vi.fn();
const mockToggleFolderFavoriteApi = vi.fn();
const mockLogout = vi.fn();

vi.mock("../api/offlineNotes.ts", () => ({
  fetchNotes: (...args: unknown[]) => mockFetchNotes(...args),
  fetchNote: (...args: unknown[]) => mockFetchNote(...args),
  createNote: (...args: unknown[]) => mockCreateNote(...args),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
  fetchTrash: (...args: unknown[]) => mockFetchTrash(...args),
  restoreNote: (...args: unknown[]) => mockRestoreNote(...args),
  permanentDeleteNote: (...args: unknown[]) => mockPermanentDeleteNote(...args),
  emptyTrash: (...args: unknown[]) => mockEmptyTrash(...args),
  fetchFolders: (...args: unknown[]) => mockFetchFolders(...args),
  createFolderApi: (...args: unknown[]) => mockCreateFolderApi(...args),
  reorderNotes: (...args: unknown[]) => mockReorderNotes(...args),
  renameFolderApi: (...args: unknown[]) => mockRenameFolderApi(...args),
  deleteFolderApi: (...args: unknown[]) => mockDeleteFolderApi(...args),
  moveFolderApi: (...args: unknown[]) => mockMoveFolderApi(...args),
  reorderFoldersApi: (...args: unknown[]) => mockReorderFoldersApi(...args),
  fetchTags: (...args: unknown[]) => mockFetchTags(...args),
  renameTagApi: (...args: unknown[]) => mockRenameTagApi(...args),
  deleteTagApi: (...args: unknown[]) => mockDeleteTagApi(...args),
  fetchNoteTitles: (...args: unknown[]) => mockFetchNoteTitles(...args),
  fetchBacklinks: (...args: unknown[]) => mockFetchBacklinks(...args),
  fetchVersions: (...args: unknown[]) => mockFetchVersions(...args),
  fetchVersion: (...args: unknown[]) => mockFetchVersion(...args),
  restoreVersion: (...args: unknown[]) => mockRestoreVersion(...args),
  fetchFavoriteNotes: (...args: unknown[]) => mockFetchFavoriteNotes(...args),
  reorderFavoriteNotes: vi.fn().mockResolvedValue(undefined),
  toggleFolderFavoriteApi: (...args: unknown[]) => mockToggleFolderFavoriteApi(...args),
}));

vi.mock("../hooks/useOfflineCache.ts", () => ({
  useOfflineCache: () => ({
    isOnline: true,
    lastSyncedAt: null,
    pendingCount: 0,
    isSyncing: false,
    reconciledIds: new Map(),
  }),
}));

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock("../hooks/useAiSettings.ts", () => ({
  useAiSettings: () => ({
    settings: { completions: false, summarize: false, tagSuggestions: false, rewrite: false, audioNotes: false, audioMode: "memo", qaAssistant: false },
    updateSetting: vi.fn(),
  }),
}));

vi.mock("../editor/ghostText.ts", () => ({
  ghostTextExtension: vi.fn(() => []),
}));

vi.mock("../editor/rewriteMenu.ts", () => ({
  rewriteExtension: vi.fn(() => []),
}));

vi.mock("../editor/wikiLinkComplete.ts", () => ({
  wikiLinkAutocomplete: vi.fn(() => []),
}));

vi.mock("../api/ai.ts", () => ({
  fetchCompletion: vi.fn(),
  askQuestion: vi.fn(),
  summarizeNote: vi.fn(),
  suggestTags: vi.fn(),
  rewriteText: vi.fn(),
  transcribeAudio: vi.fn(),
  enableEmbeddings: vi.fn().mockResolvedValue({ enabled: true }),
  disableEmbeddings: vi.fn().mockResolvedValue({ enabled: false }),
  getEmbeddingStatus: vi.fn().mockResolvedValue({ enabled: false, pendingCount: 0, totalWithEmbeddings: 0 }),
}));

const mockNote = {
  id: "note-1",
  title: "Test Note",
  content: "Test content",
  folder: null,
  folderId: null,
  folderPath: null,
  tags: [],
  summary: null,
  favorite: false,
  sortOrder: 0,
  favoriteSortOrder: 0,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
};

const mockTrashedNote = {
  ...mockNote,
  id: "trash-1",
  title: "Trashed Note",
  content: "Deleted content",
  deletedAt: "2025-06-01T00:00:00.000Z",
};

function renderNotesPage() {
  return render(
    <MemoryRouter>
      <NotesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockFetchNotes.mockResolvedValue({ notes: [], total: 0 });
  mockFetchTrash.mockResolvedValue({ notes: [], total: 0 });
  mockFetchFolders.mockResolvedValue({ folders: [] });
  mockFetchTags.mockResolvedValue({ tags: [] });
  mockFetchNoteTitles.mockResolvedValue({ notes: [] });
  mockFetchBacklinks.mockResolvedValue({ backlinks: [] });
  mockFetchVersions.mockResolvedValue({ versions: [], total: 0 });
  mockFetchFavoriteNotes.mockResolvedValue({ notes: [] });
});

describe("NotesPage", () => {
  it("shows empty state when there are no notes", async () => {
    renderNotesPage();

    await screen.findByText("No notes yet");
  });

  it("renders note list when fetchNotes returns notes", async () => {
    mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

    renderNotesPage();

    await screen.findByText("Test Note");
  });

  it("shows note content when a note is selected", async () => {
    mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

    renderNotesPage();

    const noteButton = await screen.findByText("Test Note");
    await userEvent.click(noteButton);

    expect(screen.getByDisplayValue("Test Note")).toBeInTheDocument();
    const editor = screen.getByTestId("markdown-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("Test content");
  });

  it("calls createNote when new note button is clicked", async () => {
    const newNote = {
      ...mockNote,
      id: "note-2",
      title: "Untitled",
      content: "",
    };
    mockCreateNote.mockResolvedValue(newNote);

    renderNotesPage();

    await screen.findByText("No notes yet");

    const createButtons = screen.getAllByTitle("New note");
    await userEvent.click(createButtons[0]);

    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Untitled" }),
    );
  });

  it("handles delete with confirmation flow", async () => {
    mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });
    mockDeleteNote.mockResolvedValue(undefined);

    renderNotesPage();

    // Select a note first
    const noteButton = await screen.findByText("Test Note");
    await userEvent.click(noteButton);

    // Click delete — first click shows confirmation
    const deleteButton = screen.getByLabelText("Delete");
    await userEvent.click(deleteButton);

    // Confirmation UI should appear
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();

    // Click confirm to actually delete
    await userEvent.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(mockDeleteNote).toHaveBeenCalledWith("note-1");
    });
  });

  describe("Sort controls", () => {
    it("renders sort controls in notes view", async () => {
      renderNotesPage();

      await screen.findByText("No notes yet");

      expect(screen.getByLabelText("Sort by")).toBeInTheDocument();
    });

    it("passes sortBy and sortOrder to fetchNotes", async () => {
      renderNotesPage();

      await screen.findByText("No notes yet");

      // Default call should include sortBy and sortOrder
      expect(mockFetchNotes).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: "updatedAt",
          sortOrder: "desc",
        }),
      );
    });

    it("changes sort field when dropdown changes", async () => {
      renderNotesPage();
      await screen.findByText("No notes yet");

      const sortSelect = screen.getByLabelText("Sort by");
      await userEvent.selectOptions(sortSelect, "title");

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          expect.objectContaining({
            sortBy: "title",
          }),
        );
      });
    });

    it("toggles sort order when direction button is clicked", async () => {
      renderNotesPage();
      await screen.findByText("No notes yet");

      // Default is desc, button shows down arrow
      const sortOrderButton = screen.getByLabelText("Sort descending");
      await userEvent.click(sortOrderButton);

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          expect.objectContaining({
            sortOrder: "asc",
          }),
        );
      });
    });
  });

  describe("Trash view", () => {
    it("shows trash button with count badge", async () => {
      mockFetchTrash.mockResolvedValue({ notes: [], total: 3 });

      renderNotesPage();

      const trashButton = await screen.findByTitle("Trash");
      expect(trashButton).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("switches to trash view when trash button is clicked", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });

      renderNotesPage();

      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trashed Note");
      expect(screen.getByText("Back")).toBeInTheDocument();
    });

    it("shows empty trash message", async () => {
      mockFetchTrash.mockResolvedValue({ notes: [], total: 0 });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trash is empty");
    });

    it("shows read-only preview when trash note is selected", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      const noteButton = await screen.findByText("Trashed Note");
      await userEvent.click(noteButton);

      // Should show Restore and Delete Permanently buttons
      expect(screen.getByText("Restore")).toBeInTheDocument();
      expect(screen.getByText("Delete Permanently")).toBeInTheDocument();
      // Should NOT show the editor
      expect(screen.queryByTestId("markdown-editor")).not.toBeInTheDocument();
    });

    it("restores a note from trash", async () => {
      const restoredNote = { ...mockTrashedNote, deletedAt: null };
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });
      mockRestoreNote.mockResolvedValue(restoredNote);

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      const noteButton = await screen.findByText("Trashed Note");
      await userEvent.click(noteButton);

      await userEvent.click(screen.getByText("Restore"));

      await waitFor(() => {
        expect(mockRestoreNote).toHaveBeenCalledWith("trash-1");
      });
    });

    it("permanently deletes a note with confirmation", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });
      mockPermanentDeleteNote.mockResolvedValue(undefined);

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      const noteButton = await screen.findByText("Trashed Note");
      await userEvent.click(noteButton);

      // First click shows confirmation
      await userEvent.click(screen.getByText("Delete Permanently"));
      expect(screen.getByText("Delete forever?")).toBeInTheDocument();

      // Confirm permanent delete
      await userEvent.click(screen.getByText("Confirm"));

      await waitFor(() => {
        expect(mockPermanentDeleteNote).toHaveBeenCalledWith("trash-1");
      });
    });

    it("returns to notes view when back button is clicked", async () => {
      mockFetchTrash.mockResolvedValue({ notes: [], total: 0 });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trash is empty");

      await userEvent.click(screen.getByText("Back"));

      await screen.findByText("No notes yet");
    });

    it("shows Delete All button in trash view when items exist", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trashed Note");
      expect(screen.getByText("Delete All")).toBeInTheDocument();
    });

    it("Delete All triggers ConfirmDialog and confirming calls emptyTrash", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });
      mockEmptyTrash.mockResolvedValue({ deleted: 1 });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trashed Note");

      await userEvent.click(screen.getByText("Delete All"));

      // Confirm dialog should appear
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();

      // Confirm
      await userEvent.click(screen.getByText("Delete"));

      await waitFor(() => {
        expect(mockEmptyTrash).toHaveBeenCalledWith();
      });
    });

    it("shows checkboxes on trash items", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trashed Note");
      expect(screen.getByLabelText("Select Trashed Note")).toBeInTheDocument();
    });

    it("shows Delete Selected when items are checked", async () => {
      const trash2 = { ...mockTrashedNote, id: "trash-2", title: "Trashed Note 2" };
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote, trash2],
        total: 2,
      });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trashed Note");

      // Check one item
      const checkbox = screen.getByLabelText("Select Trashed Note");
      await userEvent.click(checkbox);

      expect(screen.getByText("Delete Selected (1)")).toBeInTheDocument();
    });

    it("Delete Selected with confirmation calls emptyTrash with IDs", async () => {
      mockFetchTrash.mockResolvedValue({
        notes: [mockTrashedNote],
        total: 1,
      });
      mockEmptyTrash.mockResolvedValue({ deleted: 1 });

      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trashed Note");

      // Check the item
      const checkbox = screen.getByLabelText("Select Trashed Note");
      await userEvent.click(checkbox);

      await userEvent.click(screen.getByText("Delete Selected (1)"));

      // Confirm dialog
      expect(screen.getByText("Delete Selected")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Delete"));

      await waitFor(() => {
        expect(mockEmptyTrash).toHaveBeenCalledWith(["trash-1"]);
      });
    });

    it("hides new note button in trash view", async () => {
      mockFetchTrash.mockResolvedValue({ notes: [], total: 0 });

      renderNotesPage();
      await screen.findByText("No notes yet");

      expect(screen.getAllByTitle("New note").length).toBeGreaterThan(0);

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);

      await screen.findByText("Trash is empty");

      expect(screen.queryAllByTitle("New note")).toHaveLength(0);
    });
  });

  describe("Search mode selector", () => {
    it("does not show search mode selector when semanticSearch is disabled", async () => {
      renderNotesPage();
      await screen.findByText("No notes yet");

      expect(screen.queryByTestId("search-mode-select")).not.toBeInTheDocument();
    });
  });

  describe("Folder selector", () => {
    const treeFolders = [
      {
        id: "f1",
        name: "Work",
        parentId: null,
        sortOrder: 0,
        count: 1,
        totalCount: 1,
        createdAt: "2025-01-01T00:00:00.000Z",
        children: [],
      },
    ];

    it("renders folder selector showing current folder when note is selected", async () => {
      const noteInFolder = { ...mockNote, folderId: "f1", folder: "Work" };
      mockFetchNotes.mockResolvedValue({ notes: [noteInFolder], total: 1 });
      mockFetchFolders.mockResolvedValue({ folders: treeFolders });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderButton = screen.getByTestId("note-folder-select");
      expect(folderButton).toHaveAttribute("title", "Work");
    });

    it("renders Unfiled when note has no folder", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderButton = screen.getByTestId("note-folder-select");
      expect(folderButton).toHaveAttribute("title", "Unfiled");
    });

    it("calls updateNote when folder is changed via selector", async () => {
      const updatedNote = { ...mockNote, folderId: "f1", folder: "Work" };
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });
      mockFetchFolders.mockResolvedValue({ folders: treeFolders });
      mockUpdateNote.mockResolvedValue(updatedNote);

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderButton = screen.getByTestId("note-folder-select");
      await userEvent.click(folderButton);

      const workOptions = await screen.findAllByText("Work");
      const dropdownOption = workOptions.find((el) => el.tagName === "BUTTON" && el.classList.contains("text-left"));
      expect(dropdownOption).toBeTruthy();
      await userEvent.click(dropdownOption!);

      await waitFor(() => {
        expect(mockUpdateNote).toHaveBeenCalledWith("note-1", { folderId: "f1" });
      });
    });

    it("sets folderId to null when Unfiled is selected", async () => {
      const noteInFolder = { ...mockNote, folderId: "f1", folder: "Work" };
      const updatedNote = { ...mockNote, folderId: null, folder: null };
      mockFetchNotes.mockResolvedValue({ notes: [noteInFolder], total: 1 });
      mockFetchFolders.mockResolvedValue({ folders: treeFolders });
      mockUpdateNote.mockResolvedValue(updatedNote);

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderButton = screen.getByTestId("note-folder-select");
      await userEvent.click(folderButton);

      const unfiledOption = await screen.findByRole("button", { name: "Unfiled" });
      await userEvent.click(unfiledOption);

      await waitFor(() => {
        expect(mockUpdateNote).toHaveBeenCalledWith("note-1", { folderId: null });
      });
    });
  });

  describe("Tags", () => {
    it("renders tag pills when search is focused", async () => {
      const user = userEvent.setup();
      mockFetchTags.mockResolvedValue({
        tags: [
          { name: "javascript", count: 3 },
          { name: "react", count: 2 },
        ],
      });

      renderNotesPage();

      await screen.findByText("No notes yet");

      // Tags are hidden until search is focused
      const searchInput = screen.getByPlaceholderText("Search notes... (⌘K)");
      await user.click(searchInput);

      expect(screen.getByText("javascript")).toBeInTheDocument();
      expect(screen.getByText("react")).toBeInTheDocument();
    });

    it("does not render tag pills when no tags exist", async () => {
      const user = userEvent.setup();
      renderNotesPage();

      await screen.findByText("No notes yet");

      const searchInput = screen.getByPlaceholderText("Search notes... (⌘K)");
      await user.click(searchInput);

      expect(screen.queryByText("javascript")).not.toBeInTheDocument();
    });

    it("shows tag input when a note is selected", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      expect(screen.getByLabelText("Add tag")).toBeInTheDocument();
    });
  });

  describe("Deep linking", () => {
    it("navigating to /notes/:id selects that note", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      render(
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>,
      );

      // Should show the note content since it was found in the list
      await waitFor(() => {
        expect(screen.getByDisplayValue("Test Note")).toBeInTheDocument();
      });
    });

    it("shows copy link button when a note is selected", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      expect(screen.getByLabelText("Copy link")).toBeInTheDocument();
    });
  });

  describe("Focus mode", () => {
    it("collapses sidebar after Cmd+Shift+D and restores on second press", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      await screen.findByText("Test Note");

      // Sidebar should be visible (width > 0)
      const sidebar = screen.getByText("NoteSync").closest("aside")!;
      expect(sidebar.style.width).not.toBe("0px");

      // Press Cmd+Shift+D to enter focus mode
      await userEvent.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");

      // Sidebar should be collapsed (width 0)
      await waitFor(() => {
        expect(sidebar.style.width).toBe("0px");
      });

      // Press Cmd+Shift+D again to exit focus mode
      await userEvent.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");

      // Sidebar should be visible again
      await waitFor(() => {
        expect(sidebar.style.width).not.toBe("0px");
      });
    });
  });

  describe("Import/Export", () => {
    it("renders import button in sidebar footer", async () => {
      renderNotesPage();
      await screen.findByText("No notes yet");
      expect(screen.getByTitle("Import")).toBeInTheDocument();
    });

    it("hides import button in trash view", async () => {
      mockFetchTrash.mockResolvedValue({ notes: [], total: 0 });
      renderNotesPage();
      await screen.findByText("No notes yet");

      const trashButton = screen.getByTitle("Trash");
      await userEvent.click(trashButton);
      await screen.findByText("Trash is empty");

      expect(screen.queryByTitle("Import")).not.toBeInTheDocument();
    });

    it("shows all export format options in note context menu", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });
      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.pointer({ keys: "[MouseRight]", target: noteButton });

      expect(screen.getByText("Export as .md")).toBeInTheDocument();
      expect(screen.getByText("Export as .txt")).toBeInTheDocument();
      expect(screen.getByText("Export as .pdf")).toBeInTheDocument();
    });
  });

  describe("Editor tabs", () => {
    const mockNote2 = {
      ...mockNote,
      id: "note-2",
      title: "Second Note",
      content: "Second content",
    };

    const mockNote3 = {
      ...mockNote,
      id: "note-3",
      title: "Third Note",
      content: "Third content",
    };

    it("does not show tab bar on single-click when no tabs open", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      // Tab bar should not appear — single-click with no tabs doesn't open a tab
      expect(screen.queryByLabelText("Close Test Note")).not.toBeInTheDocument();
    });

    it("single-click with no tabs does not create tab when switching notes", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote, mockNote2], total: 2 });

      renderNotesPage();

      await userEvent.click(await screen.findByText("Test Note"));
      await userEvent.click(screen.getByText("Second Note"));

      // No tabs should exist
      expect(screen.queryByLabelText("Close Test Note")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Close Second Note")).not.toBeInTheDocument();
    });

    it("opens a tab on double-click", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.dblClick(noteButton);

      // Tab bar should appear with close button
      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });
    });

    it("double-clicking a note only opens that note as a tab (no promote)", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote, mockNote2], total: 2 });

      renderNotesPage();

      // Single-click first note (no tab created)
      const noteButton1 = await screen.findByText("Test Note");
      await userEvent.click(noteButton1);
      expect(screen.queryByLabelText("Close Test Note")).not.toBeInTheDocument();

      // Double-click second note — only the double-clicked note opens as a tab
      const noteButton2 = await screen.findByText("Second Note");
      await userEvent.dblClick(noteButton2);

      await waitFor(() => {
        expect(screen.getByLabelText("Close Second Note")).toBeInTheDocument();
      });
      // The single-clicked note should NOT have a tab
      expect(screen.queryByLabelText("Close Test Note")).not.toBeInTheDocument();
    });

    it("single-click opens preview tab when tabs are already open", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote, mockNote2], total: 2 });

      renderNotesPage();

      // Double-click to open a permanent tab
      await userEvent.dblClick(await screen.findByText("Test Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });

      // Single-click another note — should open as preview (italic) tab
      await userEvent.click(screen.getByText("Second Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Second Note")).toBeInTheDocument();
      });
    });

    it("single-click replaces existing preview tab", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote, mockNote2, mockNote3], total: 3 });

      renderNotesPage();

      // Open permanent tab
      await userEvent.dblClick(await screen.findByText("Test Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });

      // Single-click note 2 — opens preview tab
      await userEvent.click(screen.getByText("Second Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Second Note")).toBeInTheDocument();
      });

      // Single-click note 3 — should REPLACE preview tab (note 2 removed)
      await userEvent.click(screen.getByText("Third Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Third Note")).toBeInTheDocument();
        expect(screen.queryByLabelText("Close Second Note")).not.toBeInTheDocument();
      });
    });

    it("double-clicking preview note pins it", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote, mockNote2, mockNote3], total: 3 });

      renderNotesPage();

      // Open permanent tab
      await userEvent.dblClick(await screen.findByText("Test Note"));

      // Single-click note 2 — opens preview tab
      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText("Second Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Second Note")).toBeInTheDocument();
      });

      // Double-click same note 2 in sidebar — should pin it
      const sidebarNotes = screen.getByTestId("note-list");
      const sidebarNote2 = sidebarNotes.querySelector("button")!;
      // Find the Second Note button within the sidebar
      const allSecondNotes = screen.getAllByText("Second Note");
      const sidebarSecondNote = allSecondNotes.find((el) => sidebarNotes.contains(el))!;
      await userEvent.dblClick(sidebarSecondNote);

      // Now single-click note 3 — should open a NEW preview tab (note 2 stays)
      await userEvent.click(screen.getByText("Third Note"));
      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
        expect(screen.getByLabelText("Close Second Note")).toBeInTheDocument();
        expect(screen.getByLabelText("Close Third Note")).toBeInTheDocument();
      });
    });

    it("closes tab and switches to adjacent when closing active tab", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote, mockNote2], total: 2 });

      renderNotesPage();

      // Double-click both notes to open them as tabs
      const noteButton1 = await screen.findByText("Test Note");
      await userEvent.dblClick(noteButton1);
      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });

      const noteButton2 = await screen.findByText("Second Note");
      await userEvent.dblClick(noteButton2);
      await waitFor(() => {
        expect(screen.getByLabelText("Close Second Note")).toBeInTheDocument();
      });

      // Close the active tab (Second Note)
      await userEvent.click(screen.getByLabelText("Close Second Note"));

      // Should switch to Test Note (remaining tab)
      await waitFor(() => {
        expect(screen.getByDisplayValue("Test Note")).toBeInTheDocument();
        expect(screen.queryByLabelText("Close Second Note")).not.toBeInTheDocument();
      });
    });

    it("clears editor when closing the last tab", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      // Open note as tab
      const noteButton = await screen.findByText("Test Note");
      await userEvent.dblClick(noteButton);

      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });

      // Close the only tab
      await userEvent.click(screen.getByLabelText("Close Test Note"));

      // Editor should be cleared — no title input
      await waitFor(() => {
        expect(screen.queryByDisplayValue("Test Note")).not.toBeInTheDocument();
      });
    });

    it("removes tab when note is deleted", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });
      mockDeleteNote.mockResolvedValue(undefined);

      renderNotesPage();

      // Open note as tab via double-click
      const noteButton = await screen.findByText("Test Note");
      await userEvent.dblClick(noteButton);

      await waitFor(() => {
        expect(screen.getByLabelText("Close Test Note")).toBeInTheDocument();
      });

      // Delete the note
      const deleteButton = screen.getByLabelText("Delete");
      await userEvent.click(deleteButton);
      await userEvent.click(screen.getByText("Yes"));

      // Tab should be removed
      await waitFor(() => {
        expect(mockDeleteNote).toHaveBeenCalledWith("note-1");
        expect(screen.queryByLabelText("Close Test Note")).not.toBeInTheDocument();
      });
    });

    it("creates a tab when creating a new note", async () => {
      const newNote = {
        ...mockNote,
        id: "note-new",
        title: "Untitled",
        content: "",
      };
      mockCreateNote.mockResolvedValue(newNote);

      renderNotesPage();
      await screen.findByText("No notes yet");

      const createButtons = screen.getAllByTitle("New note");
      await userEvent.click(createButtons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText("Close Untitled")).toBeInTheDocument();
      });
    });
  });
});
