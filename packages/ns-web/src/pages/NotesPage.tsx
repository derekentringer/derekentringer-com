import { useState, useEffect, useCallback, useRef } from "react";
import type { Note } from "@derekentringer/shared/ns";
import { useAuth } from "../context/AuthContext.tsx";
import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
} from "../api/notes.ts";

export function NotesPage() {
  const { logout } = useAuth();

  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const loadNotes = useCallback(async (searchQuery?: string) => {
    try {
      const result = await fetchNotes(
        searchQuery ? { search: searchQuery } : undefined,
      );
      setNotes(result.notes);
    } catch {
      showError("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load notes on mount and when search changes
  useEffect(() => {
    loadNotes(debouncedSearch || undefined);
  }, [debouncedSearch, loadNotes]);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  function selectNote(note: Note) {
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setIsDirty(false);
    setConfirmDelete(false);
  }

  async function handleCreate() {
    try {
      const note = await createNote({ title: "Untitled" });
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
    } catch {
      showError("Failed to create note");
    }
  }

  const handleSave = useCallback(async () => {
    if (!selectedId || !isDirty || isSaving) return;

    setIsSaving(true);
    try {
      const updated = await updateNote(selectedId, { title, content });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n)),
      );
      setIsDirty(false);
    } catch {
      showError("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [selectedId, isDirty, isSaving, title, content]);

  async function handleDelete() {
    if (!selectedId) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      await deleteNote(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setIsDirty(false);
      setConfirmDelete(false);
    } catch {
      showError("Failed to delete note");
    }
  }

  // Keyboard shortcut: Cmd/Ctrl+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-normal text-foreground">NoteSync</h1>
          <button
            onClick={handleCreate}
            className="w-7 h-7 flex items-center justify-center rounded bg-primary text-black hover:bg-primary-hover transition-colors text-lg leading-none"
            title="New note"
          >
            +
          </button>
        </div>

        <div className="p-2">
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {debouncedSearch ? "No notes found" : "No notes yet"}
            </div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                onClick={() => selectNote(note)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors truncate ${
                  note.id === selectedId
                    ? "bg-accent text-foreground"
                    : "text-muted hover:bg-accent hover:text-foreground"
                }`}
              >
                {note.title || "Untitled"}
              </button>
            ))
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Editor area */}
      <main className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
              <span className="text-xs text-muted-foreground">
                {isSaving
                  ? "Saving..."
                  : isDirty
                    ? "Unsaved changes"
                    : "Saved"}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="px-3 py-1 rounded-md bg-primary text-black text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Delete?</span>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                >
                  Delete
                </button>
              )}
            </div>

            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Note title"
              className="px-4 py-3 bg-transparent text-xl text-foreground placeholder:text-muted-foreground focus:outline-none border-b border-border"
            />

            {/* Content */}
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Start writing..."
              className="flex-1 px-4 py-3 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">
              Select a note or create a new one
            </p>
          </div>
        )}
      </main>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-card border border-destructive rounded-md px-4 py-3 shadow-lg flex items-center gap-3">
          <span className="text-sm text-destructive">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
