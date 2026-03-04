import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
const mockFetchTags = vi.fn();
const mockRenameTagApi = vi.fn();
const mockDeleteTagApi = vi.fn();
const mockLogout = vi.fn();

vi.mock("../api/notes.ts", () => ({
  fetchNotes: (...args: unknown[]) => mockFetchNotes(...args),
  createNote: (...args: unknown[]) => mockCreateNote(...args),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
  fetchTrash: (...args: unknown[]) => mockFetchTrash(...args),
  restoreNote: (...args: unknown[]) => mockRestoreNote(...args),
  permanentDeleteNote: (...args: unknown[]) => mockPermanentDeleteNote(...args),
  fetchFolders: (...args: unknown[]) => mockFetchFolders(...args),
  createFolderApi: (...args: unknown[]) => mockCreateFolderApi(...args),
  reorderNotes: (...args: unknown[]) => mockReorderNotes(...args),
  renameFolderApi: (...args: unknown[]) => mockRenameFolderApi(...args),
  deleteFolderApi: (...args: unknown[]) => mockDeleteFolderApi(...args),
  fetchTags: (...args: unknown[]) => mockFetchTags(...args),
  renameTagApi: (...args: unknown[]) => mockRenameTagApi(...args),
  deleteTagApi: (...args: unknown[]) => mockDeleteTagApi(...args),
}));

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock("../hooks/useAiSettings.ts", () => ({
  useAiSettings: () => ({
    settings: { completions: false, summarize: false, tagSuggestions: false, rewrite: false, audioNotes: false, audioMode: "memo" },
    updateSetting: vi.fn(),
  }),
}));

vi.mock("../editor/ghostText.ts", () => ({
  ghostTextExtension: vi.fn(() => []),
}));

vi.mock("../editor/rewriteMenu.ts", () => ({
  rewriteExtension: vi.fn(() => []),
}));

vi.mock("../api/ai.ts", () => ({
  fetchCompletion: vi.fn(),
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
  tags: [],
  summary: null,
  sortOrder: 0,
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
  mockFetchNotes.mockResolvedValue({ notes: [], total: 0 });
  mockFetchTrash.mockResolvedValue({ notes: [], total: 0 });
  mockFetchFolders.mockResolvedValue({ folders: [] });
  mockFetchTags.mockResolvedValue({ tags: [] });
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

    expect(mockCreateNote).toHaveBeenCalledWith({ title: "Untitled" });
  });

  it("handles delete with confirmation flow", async () => {
    mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });
    mockDeleteNote.mockResolvedValue(undefined);

    renderNotesPage();

    // Select a note first
    const noteButton = await screen.findByText("Test Note");
    await userEvent.click(noteButton);

    // Click delete — first click shows confirmation
    const deleteButton = screen.getByText("Delete");
    await userEvent.click(deleteButton);

    // Confirmation UI should appear
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();

    // Click confirm to actually delete
    await userEvent.click(screen.getByText("Confirm"));

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
          sortBy: "sortOrder",
          sortOrder: "asc",
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

      // Default is asc, button shows up arrow
      const sortOrderButton = screen.getByLabelText("Sort ascending");
      await userEvent.click(sortOrderButton);

      await waitFor(() => {
        expect(mockFetchNotes).toHaveBeenCalledWith(
          expect.objectContaining({
            sortOrder: "desc",
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
      expect(screen.getByText("Back to notes")).toBeInTheDocument();
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

      await userEvent.click(screen.getByText("Back to notes"));

      await screen.findByText("No notes yet");
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
    it("renders folder selector showing current folder when note is selected", async () => {
      const noteInFolder = { ...mockNote, folder: "Work" };
      mockFetchNotes.mockResolvedValue({ notes: [noteInFolder], total: 1 });
      mockFetchFolders.mockResolvedValue({
        folders: [{ name: "Work", count: 1, createdAt: "2025-01-01T00:00:00.000Z" }],
      });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderSelect = screen.getByTestId("note-folder-select") as HTMLSelectElement;
      expect(folderSelect.value).toBe("Work");
    });

    it("renders Unfiled when note has no folder", async () => {
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderSelect = screen.getByTestId("note-folder-select") as HTMLSelectElement;
      expect(folderSelect.value).toBe("");
    });

    it("calls updateNote when folder is changed via selector", async () => {
      const updatedNote = { ...mockNote, folder: "Work" };
      mockFetchNotes.mockResolvedValue({ notes: [mockNote], total: 1 });
      mockFetchFolders.mockResolvedValue({
        folders: [{ name: "Work", count: 0, createdAt: "2025-01-01T00:00:00.000Z" }],
      });
      mockUpdateNote.mockResolvedValue(updatedNote);

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderSelect = screen.getByTestId("note-folder-select");
      await userEvent.selectOptions(folderSelect, "Work");

      await waitFor(() => {
        expect(mockUpdateNote).toHaveBeenCalledWith("note-1", { folder: "Work" });
      });
    });

    it("sets folder to null when Unfiled is selected", async () => {
      const noteInFolder = { ...mockNote, folder: "Work" };
      const updatedNote = { ...mockNote, folder: null };
      mockFetchNotes.mockResolvedValue({ notes: [noteInFolder], total: 1 });
      mockFetchFolders.mockResolvedValue({
        folders: [{ name: "Work", count: 1, createdAt: "2025-01-01T00:00:00.000Z" }],
      });
      mockUpdateNote.mockResolvedValue(updatedNote);

      renderNotesPage();

      const noteButton = await screen.findByText("Test Note");
      await userEvent.click(noteButton);

      const folderSelect = screen.getByTestId("note-folder-select");
      await userEvent.selectOptions(folderSelect, "");

      await waitFor(() => {
        expect(mockUpdateNote).toHaveBeenCalledWith("note-1", { folder: null });
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
      const searchInput = screen.getByPlaceholderText("Search notes...");
      await user.click(searchInput);

      expect(screen.getByText("javascript")).toBeInTheDocument();
      expect(screen.getByText("react")).toBeInTheDocument();
    });

    it("does not render tag pills when no tags exist", async () => {
      const user = userEvent.setup();
      renderNotesPage();

      await screen.findByText("No notes yet");

      const searchInput = screen.getByPlaceholderText("Search notes...");
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
});
