import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Note, NoteSearchResult, NoteSortField, FolderSortField, SortOrder, FolderInfo, TagInfo } from "@derekentringer/shared/ns";
import { useAuth } from "../context/AuthContext.tsx";
import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  fetchTrash,
  restoreNote as apiRestoreNote,
  permanentDeleteNote as apiPermanentDeleteNote,
  fetchFolders,
  createFolderApi,
  reorderNotes as apiReorderNotes,
  renameFolderApi,
  deleteFolderApi,
  fetchTags,
  renameTagApi,
  deleteTagApi,
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
import { FolderList } from "../components/FolderList.tsx";
import { NoteList } from "../components/NoteList.tsx";
import { TagBrowser } from "../components/TagBrowser.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";

type SidebarView = "notes" | "trash";

export function NotesPage() {
  const { logout } = useAuth();

  const [notes, setNotes] = useState<NoteSearchResult[]>([]);
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
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Note sort state
  const [sortBy, setSortBy] = useState<NoteSortField>("sortOrder");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Folder sort state
  const [folderSortBy, setFolderSortBy] = useState<FolderSortField>("name");
  const [folderSortOrder, setFolderSortOrder] = useState<SortOrder>("asc");

  // Folder state
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [allNotesCount, setAllNotesCount] = useState(0);

  // Tag state
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Trash state
  const [sidebarView, setSidebarView] = useState<SidebarView>("notes");
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);

  const [searchFocused, setSearchFocused] = useState(false);

  const folderResize = useResizable({
    direction: "horizontal",
    initialSize: 160,
    minSize: 60,
    maxSize: 400,
    storageKey: "ns-folder-height",
  });
  const sidebarResize = useResizable({
    direction: "vertical",
    initialSize: 256,
    minSize: 180,
    maxSize: 480,
    storageKey: "ns-sidebar-width",
  });

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

  const loadFolders = useCallback(async () => {
    try {
      const [folderResult, notesResult, tagResult] = await Promise.all([
        fetchFolders(),
        fetchNotes({ pageSize: 0 }),
        fetchTags(),
      ]);
      setFolders(folderResult.folders);
      setAllNotesCount(notesResult.total);
      setTags(tagResult.tags);
    } catch {
      // Silent fail for folder/tag loading
    }
  }, []);

  const loadNotes = useCallback(
    async (searchQuery?: string) => {
      try {
        const folderParam =
          activeFolder === "__unfiled__"
            ? undefined
            : activeFolder ?? undefined;
        const result = await fetchNotes({
          search: searchQuery || undefined,
          folder: folderParam,
          tags: activeTags.length > 0 ? activeTags : undefined,
          sortBy,
          sortOrder,
        });
        let filtered = result.notes;
        // Client-side filter for "unfiled" (notes with no folder)
        if (activeFolder === "__unfiled__") {
          filtered = filtered.filter((n) => !n.folder);
        }
        setNotes(filtered);
      } catch {
        showError("Failed to load notes");
      } finally {
        setIsLoading(false);
      }
    },
    [sortBy, sortOrder, activeFolder, activeTags],
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

  // Load notes on mount and when search/sort/folder changes
  useEffect(() => {
    loadNotes(debouncedSearch || undefined);
  }, [debouncedSearch, loadNotes]);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

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
      const folder =
        activeFolder && activeFolder !== "__unfiled__"
          ? activeFolder
          : undefined;
      const note = await createNote({ title: "Untitled", folder });
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
      loadFolders();
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
      loadFolders();
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
      loadFolders();
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

  async function handleReorder(activeId: string, overId: string) {
    const oldIndex = notes.findIndex((n) => n.id === activeId);
    const newIndex = notes.findIndex((n) => n.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...notes];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Optimistic update
    const updatedNotes = reordered.map((n, i) => ({ ...n, sortOrder: i }));
    setNotes(updatedNotes);

    try {
      await apiReorderNotes({
        order: updatedNotes.map((n) => ({
          id: n.id,
          sortOrder: n.sortOrder,
        })),
      });
    } catch {
      showError("Failed to reorder notes");
      loadNotes(debouncedSearch || undefined);
    }
  }

  async function handleCreateFolder(name: string) {
    try {
      await createFolderApi(name);
      const foldersResult = await fetchFolders();
      setFolders(foldersResult.folders);
      setActiveFolder(name);
    } catch {
      showError("Failed to create folder");
    }
  }

  async function handleRenameFolder(oldName: string, newName: string) {
    try {
      await renameFolderApi(oldName, newName);
      if (activeFolder === oldName) {
        setActiveFolder(newName);
      }
      loadFolders();
      loadNotes(debouncedSearch || undefined);
    } catch {
      showError("Failed to rename folder");
    }
  }

  function handleToggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleRenameTag(oldName: string, newName: string) {
    try {
      await renameTagApi(oldName, newName);
      setActiveTags((prev) =>
        prev.map((t) => (t === oldName ? newName : t)),
      );
      loadFolders(); // reloads tags too
      loadNotes(debouncedSearch || undefined);
    } catch {
      showError("Failed to rename tag");
    }
  }

  async function handleDeleteTag(name: string) {
    try {
      await deleteTagApi(name);
      setActiveTags((prev) => prev.filter((t) => t !== name));
      loadFolders(); // reloads tags too
      loadNotes(debouncedSearch || undefined);
    } catch {
      showError("Failed to delete tag");
    }
  }

  async function handleTagsChange(newTags: string[]) {
    if (!selectedId) return;
    try {
      const updated = await updateNote(selectedId, { tags: newTags });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n)),
      );
      loadFolders(); // reloads tags too
    } catch {
      showError("Failed to update tags");
    }
  }

  async function handleDeleteFolder(name: string) {
    try {
      await deleteFolderApi(name);
      if (activeFolder === name) {
        setActiveFolder(null);
      }
      loadFolders();
      loadNotes(debouncedSearch || undefined);
    } catch {
      showError("Failed to delete folder");
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

  const sortedFolders = useMemo(() => {
    const sorted = [...folders];
    sorted.sort((a, b) => {
      let cmp: number;
      if (folderSortBy === "createdAt") {
        cmp = a.createdAt.localeCompare(b.createdAt);
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return folderSortOrder === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [folders, folderSortBy, folderSortOrder]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="bg-sidebar flex flex-col shrink-0" style={{ width: sidebarResize.size }}>
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
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="w-full px-3 py-1.5 pr-8 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded bg-subtle text-muted-foreground hover:text-foreground transition-colors text-xs"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{
                  maxHeight: searchFocused || activeTags.length > 0 || search ? "200px" : "0px",
                  opacity: searchFocused || activeTags.length > 0 || search ? 1 : 0,
                }}
              >
                <div className="pt-2">
                  <TagBrowser
                    tags={tags}
                    activeTags={activeTags}
                    onToggleTag={handleToggleTag}
                    onRenameTag={handleRenameTag}
                    onDeleteTag={handleDeleteTag}
                  />
                </div>
              </div>
            </div>

            <div className="shrink-0 overflow-y-auto" style={{ height: folderResize.size }}>
              <FolderList
                folders={sortedFolders}
                activeFolder={activeFolder}
                totalNotes={allNotesCount}
                folderSortBy={folderSortBy}
                folderSortOrder={folderSortOrder}
                onFolderSortByChange={setFolderSortBy}
                onFolderSortOrderChange={setFolderSortOrder}
                onSelectFolder={setActiveFolder}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
              />
            </div>

            <ResizeDivider
              direction="horizontal"
              isDragging={folderResize.isDragging}
              onPointerDown={folderResize.onPointerDown}
            />

            <div className="px-2 py-1">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Notes
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as NoteSortField)}
                    className="px-1 py-0 rounded bg-transparent border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                    aria-label="Sort by"
                  >
                    <option value="sortOrder">Manual</option>
                    <option value="updatedAt">Modified</option>
                    <option value="createdAt">Created</option>
                    <option value="title">Title</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title={sortOrder === "asc" ? "Ascending" : "Descending"}
                    aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
                  >
                    {sortOrder === "asc" ? "\u2191" : "\u2193"}
                  </button>
                  <button
                    onClick={handleCreate}
                    className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="New note"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-2" data-testid="note-list">
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : notes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {debouncedSearch ? "No notes found" : "No notes yet"}
                </div>
              ) : (
                <NoteList
                  notes={notes}
                  selectedId={selectedId}
                  onSelect={selectNote}
                  onReorder={handleReorder}
                  sortByManual={sortBy === "sortOrder"}
                />
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
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </aside>

      <ResizeDivider
        direction="vertical"
        isDragging={sidebarResize.isDragging}
        onPointerDown={sidebarResize.onPointerDown}
      />

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
              onFocus={(e) => {
                if (e.target.value === "Untitled") {
                  setTitle("");
                }
              }}
              onBlur={(e) => {
                if (e.target.value.trim() === "") {
                  setTitle("Untitled");
                  setIsDirty(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editorRef.current?.focus();
                }
              }}
              placeholder="Note title"
              className="px-4 py-3 bg-transparent text-xl text-foreground placeholder:text-muted-foreground focus:outline-none border-b border-border"
            />

            {/* Tags */}
            <TagInput
              tags={selectedNote?.tags ?? []}
              allTags={tags.map((t) => t.name)}
              onChange={handleTagsChange}
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
