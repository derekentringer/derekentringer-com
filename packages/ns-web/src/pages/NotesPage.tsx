import { useState, useEffect, useCallback, useRef } from "react";
import type { Note, NoteSortField, SortOrder } from "@derekentringer/shared/ns";
import { useAuth } from "../context/AuthContext.tsx";
import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  fetchTrash,
  restoreNote as apiRestoreNote,
  permanentDeleteNote as apiPermanentDeleteNote,
} from "../api/notes.ts";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "../components/MarkdownEditor.tsx";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";
import {
  EditorToolbar,
  type ViewMode,
} from "../components/EditorToolbar.tsx";
import { SortControls } from "../components/SortControls.tsx";

type SidebarView = "notes" | "trash";

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
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Sort state
  const [sortBy, setSortBy] = useState<NoteSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Trash state
  const [sidebarView, setSidebarView] = useState<SidebarView>("notes");
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);

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

  const loadNotes = useCallback(
    async (searchQuery?: string) => {
      try {
        const result = await fetchNotes({
          search: searchQuery || undefined,
          sortBy,
          sortOrder,
        });
        setNotes(result.notes);
      } catch {
        showError("Failed to load notes");
      } finally {
        setIsLoading(false);
      }
    },
    [sortBy, sortOrder],
  );

  const loadTrash = useCallback(async () => {
    try {
      const result = await fetchTrash();
      setTrashNotes(result.notes);
      setTrashTotal(result.total);
    } catch {
      showError("Failed to load trash");
    }
  }, []);

  // Load notes on mount and when search/sort changes
  useEffect(() => {
    loadNotes(debouncedSearch || undefined);
  }, [debouncedSearch, loadNotes]);

  // Load trash count on mount (for badge)
  useEffect(() => {
    fetchTrash({ pageSize: 0 })
      .then((result) => setTrashTotal(result.total))
      .catch(() => {});
  }, []);

  // Load trash notes when switching to trash view
  useEffect(() => {
    if (sidebarView === "trash") {
      loadTrash();
    }
  }, [sidebarView, loadTrash]);

  const selectedNote =
    sidebarView === "notes"
      ? notes.find((n) => n.id === selectedId) ?? null
      : trashNotes.find((n) => n.id === selectedId) ?? null;

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
    setConfirmPermanentDelete(false);
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
      setTrashTotal((prev) => prev + 1);
    } catch {
      showError("Failed to delete note");
    }
  }

  async function handleRestore() {
    if (!selectedId) return;

    try {
      const restored = await apiRestoreNote(selectedId);
      setTrashNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setTrashTotal((prev) => prev - 1);
      setNotes((prev) => [restored, ...prev]);
      setSelectedId(null);
      setTitle("");
      setContent("");
    } catch {
      showError("Failed to restore note");
    }
  }

  async function handlePermanentDelete() {
    if (!selectedId) return;

    if (!confirmPermanentDelete) {
      setConfirmPermanentDelete(true);
      return;
    }

    try {
      await apiPermanentDeleteNote(selectedId);
      setTrashNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setTrashTotal((prev) => prev - 1);
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmPermanentDelete(false);
    } catch {
      showError("Failed to permanently delete note");
    }
  }

  function switchToTrash() {
    setSidebarView("trash");
    setSelectedId(null);
    setTitle("");
    setContent("");
    setIsDirty(false);
    setConfirmDelete(false);
  }

  function switchToNotes() {
    setSidebarView("notes");
    setSelectedId(null);
    setTitle("");
    setContent("");
    setIsDirty(false);
    setConfirmPermanentDelete(false);
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
          {sidebarView === "notes" && (
            <button
              onClick={handleCreate}
              className="w-7 h-7 flex items-center justify-center rounded bg-primary text-black hover:bg-primary-hover transition-colors text-lg leading-none"
              title="New note"
            >
              +
            </button>
          )}
        </div>

        {sidebarView === "notes" ? (
          <>
            <div className="p-2">
              <input
                type="text"
                placeholder="Search notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <SortControls
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortByChange={setSortBy}
              onSortOrderChange={setSortOrder}
            />

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
          </>
        ) : (
          <>
            <div className="p-2">
              <button
                onClick={switchToNotes}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>&larr;</span> Back to notes
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              {trashNotes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Trash is empty
                </div>
              ) : (
                trashNotes.map((note) => (
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
          </>
        )}

        <div className="p-4 border-t border-border flex items-center justify-between">
          {sidebarView === "notes" && (
            <button
              onClick={switchToTrash}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title="View trash"
            >
              Trash
              {trashTotal > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-border text-xs text-muted-foreground">
                  {trashTotal}
                </span>
              )}
            </button>
          )}
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
        {selectedNote && sidebarView === "notes" ? (
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

            {/* Editor toolbar */}
            <EditorToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBold={() => editorRef.current?.insertBold()}
              onItalic={() => editorRef.current?.insertItalic()}
              showLineNumbers={showLineNumbers}
              onToggleLineNumbers={() => setShowLineNumbers((v) => !v)}
            />

            {/* Content */}
            <div className="flex-1 flex min-h-0">
              {viewMode !== "preview" && (
                <MarkdownEditor
                  ref={editorRef}
                  value={content}
                  onChange={(val) => {
                    setContent(val);
                    setIsDirty(true);
                  }}
                  onSave={handleSave}
                  showLineNumbers={showLineNumbers}
                  className={`${viewMode === "split" ? "w-1/2 border-r border-border" : "flex-1"} overflow-auto`}
                />
              )}
              {viewMode !== "editor" && (
                <MarkdownPreview
                  content={content}
                  className={viewMode === "split" ? "w-1/2 overflow-auto" : "flex-1"}
                />
              )}
            </div>
          </>
        ) : selectedNote && sidebarView === "trash" ? (
          <>
            {/* Trash toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
              <span className="text-xs text-muted-foreground">
                Deleted{" "}
                {selectedNote.deletedAt
                  ? new Date(selectedNote.deletedAt).toLocaleDateString()
                  : ""}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleRestore}
                className="px-3 py-1 rounded-md bg-primary text-black text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                Restore
              </button>
              {confirmPermanentDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">
                    Delete forever?
                  </span>
                  <button
                    onClick={handlePermanentDelete}
                    className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmPermanentDelete(false)}
                    className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePermanentDelete}
                  className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                >
                  Delete Permanently
                </button>
              )}
            </div>

            {/* Read-only title */}
            <div className="px-4 py-3 text-xl text-foreground border-b border-border">
              {selectedNote.title || "Untitled"}
            </div>

            {/* Read-only preview */}
            <div className="flex-1 overflow-auto">
              <MarkdownPreview
                content={selectedNote.content}
                className="flex-1"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">
              {sidebarView === "trash"
                ? "Select a note to preview"
                : "Select a note or create a new one"}
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
