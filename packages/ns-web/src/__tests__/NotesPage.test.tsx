import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotesPage } from "../pages/NotesPage.tsx";

const mockFetchNotes = vi.fn();
const mockCreateNote = vi.fn();
const mockUpdateNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockLogout = vi.fn();

vi.mock("../api/notes.ts", () => ({
  fetchNotes: (...args: unknown[]) => mockFetchNotes(...args),
  createNote: (...args: unknown[]) => mockCreateNote(...args),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
}));

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const mockNote = {
  id: "note-1",
  title: "Test Note",
  content: "Test content",
  folder: null,
  tags: [],
  summary: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
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
    expect(screen.getByDisplayValue("Test content")).toBeInTheDocument();
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

    const createButton = screen.getByTitle("New note");
    await userEvent.click(createButton);

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
});
