import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Note,
  NoteSearchResult,
  FolderInfo,
  TagInfo,
  NoteSortField,
  SortOrder,
} from "@derekentringer/ns-shared";
import {
  fetchNotes,
  createNote,
  updateNote,
  softDeleteNote,
  hardDeleteNote,
  searchNotes,
  fetchFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  fetchTags,
  renameTag,
  deleteTag,
  fetchTrash,
  restoreNote,
  initFts,
} from "../lib/db.ts";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "../components/MarkdownEditor.tsx";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";
import {
  EditorToolbar,
  type ViewMode,
} from "../components/EditorToolbar.tsx";
import { NoteList } from "../components/NoteList.tsx";
import { FolderTree } from "../components/FolderTree.tsx";
import { TagBrowser } from "../components/TagBrowser.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";

type SaveStatus = "idle" | "saving" | "saved";
type SidebarView = "notes" | "trash";

export function NotesPage() {
  const { settings: editorSettings } = useEditorSettings();

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(editorSettings.defaultViewMode);
  const [showLineNumbers, setShowLineNumbers] = useState(editorSettings.showLineNumbers);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<NoteSearchResult[] | null>(null);

  // Folders
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Tags
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Sort
  const [sortBy, setSortBy] = useState<NoteSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Trash
  const [sidebarView, setSidebarView] = useState<SidebarView>("notes");
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const loadedContentRef = useRef("");
  const loadedTitleRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  // --- Resizable panels ---

  const sidebarResize = useResizable({
    direction: "vertical",
    initialSize: 256,
    minSize: 180,
    maxSize: 480,
    storageKey: "ns-desktop-sidebar-width",
  });

  const folderResize = useResizable({
    direction: "horizontal",
    initialSize: 200,
    minSize: 80,
    maxSize: 400,
    storageKey: "ns-desktop-folder-height",
  });

  const splitResize = useResizable({
    direction: "vertical",
    initialSize: 500,
    minSize: 200,
    maxSize: 1200,
    storageKey: "ns-desktop-split-width",
  });

  // Resolve theme for editor
  const resolvedTheme = (() => {
    if (editorSettings.theme === "system") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return editorSettings.theme;
  })();

  const accentHex = resolveAccentColor(editorSettings.accentColor, resolvedTheme);

  // --- Load data on mount ---

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await initFts();
      const [notesResult, foldersResult, tagsResult] = await Promise.all([
        fetchNotes({ sortBy, sortOrder }),
        fetchFolders(),
        fetchTags(),
      ]);
      setNotes(notesResult);
      setFolders(foldersResult);
      setTags(tagsResult);
    } catch (err) {
      console.error("Failed to load data:", err);
      showError(`Failed to load data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  // --- Reload notes when folder/sort changes ---

  useEffect(() => {
    if (isLoading) return;
    reloadNotes();
  }, [activeFolder, sortBy, sortOrder]);

  async function reloadNotes() {
    try {
      const folderId =
        activeFolder === "__unfiled__" ? null : activeFolder === null ? undefined : activeFolder;
      const result = await fetchNotes({
        folderId: activeFolder === "__unfiled__" ? null : activeFolder === null ? undefined : activeFolder,
        sortBy,
        sortOrder,
      });

      // When viewing unfiled, we need to handle the special case
      if (activeFolder === "__unfiled__") {
        setNotes(result);
      } else {
        setNotes(result);
      }
    } catch (err) {
      console.error("Failed to reload notes:", err);
    }
  }

  // --- Search ---

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchNotes(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults(null);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // --- Cmd+K to focus search ---

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Note selection & editing ---

  function isDirty(): boolean {
    return title !== loadedTitleRef.current || content !== loadedContentRef.current;
  }

  function selectNote(note: Note) {
    if (isDirty() && selectedId) {
      updateNote(selectedId, { title, content }).catch((err) =>
        console.error("Failed to save previous note:", err),
      );
    }

    loadedTitleRef.current = note.title;
    loadedContentRef.current = note.content;
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSaveStatus("idle");
    setConfirmDelete(false);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  const handleSave = useCallback(async () => {
    if (!selectedId || !isDirty()) return;

    setSaveStatus("saving");
    try {
      const updated = await updateNote(selectedId, { title, content });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n)),
      );
      loadedTitleRef.current = title;
      loadedContentRef.current = content;
      setSaveStatus("saved");

      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save note:", err);
      showError("Failed to save note");
      setSaveStatus("idle");
    }
  }, [selectedId, title, content]);

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      handleSave();
    }, editorSettings.autoSaveDelay);
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    scheduleSave();
  }

  function handleContentChange(newContent: string) {
    setContent(newContent);
    scheduleSave();
  }

  // --- CRUD handlers ---

  async function handleCreate() {
    try {
      const folderId =
        activeFolder && activeFolder !== "__unfiled__" ? activeFolder : undefined;
      const note = await createNote({ title: "Untitled", folderId });
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
      await refreshSidebarData();
      setTimeout(() => {
        const titleInput = document.querySelector<HTMLInputElement>("[data-title-input]");
        titleInput?.select();
      }, 50);
    } catch (err) {
      console.error("Failed to create note:", err);
      showError(`Failed to create note: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      await softDeleteNote(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmDelete(false);
      await refreshSidebarData();
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note");
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await softDeleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedId === noteId) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        loadedTitleRef.current = "";
        loadedContentRef.current = "";
      }
      await refreshSidebarData();
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note");
    }
  }

  // --- Tags ---

  async function handleUpdateTags(noteId: string, newTags: string[]) {
    try {
      const updated = await updateNote(noteId, { tags: newTags });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      await refreshTags();
    } catch (err) {
      console.error("Failed to update tags:", err);
      showError("Failed to update tags");
    }
  }

  function handleToggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleRenameTag(oldName: string, newName: string) {
    try {
      await renameTag(oldName, newName);
      await refreshSidebarData();
      // Update active tags if the renamed tag was active
      setActiveTags((prev) =>
        prev.map((t) => (t === oldName ? newName : t)),
      );
    } catch (err) {
      console.error("Failed to rename tag:", err);
      showError("Failed to rename tag");
    }
  }

  async function handleDeleteTag(name: string) {
    try {
      await deleteTag(name);
      await refreshSidebarData();
      setActiveTags((prev) => prev.filter((t) => t !== name));
    } catch (err) {
      console.error("Failed to delete tag:", err);
      showError("Failed to delete tag");
    }
  }

  // --- Folders ---

  async function handleCreateFolder(name: string, parentId?: string) {
    try {
      await createFolder(name, parentId);
      await refreshFolders();
    } catch (err) {
      console.error("Failed to create folder:", err);
      showError("Failed to create folder");
    }
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    try {
      await renameFolder(folderId, newName);
      await refreshFolders();
    } catch (err) {
      console.error("Failed to rename folder:", err);
      showError("Failed to rename folder");
    }
  }

  async function handleDeleteFolder(folderId: string, mode: "move-up" | "recursive") {
    try {
      await deleteFolder(folderId, mode);
      if (activeFolder === folderId) {
        setActiveFolder(null);
      }
      await refreshSidebarData();
    } catch (err) {
      console.error("Failed to delete folder:", err);
      showError("Failed to delete folder");
    }
  }

  // --- Trash ---

  async function handleViewTrash() {
    setSidebarView("trash");
    setSelectedId(null);
    setTitle("");
    setContent("");
    try {
      const trash = await fetchTrash();
      setTrashNotes(trash);
    } catch (err) {
      console.error("Failed to load trash:", err);
      showError("Failed to load trash");
    }
  }

  async function handleRestoreNote(noteId: string) {
    try {
      await restoreNote(noteId);
      setTrashNotes((prev) => prev.filter((n) => n.id !== noteId));
      await refreshSidebarData();
    } catch (err) {
      console.error("Failed to restore note:", err);
      showError("Failed to restore note");
    }
  }

  async function handlePermanentDelete(noteId: string) {
    try {
      await hardDeleteNote(noteId);
      setTrashNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      console.error("Failed to permanently delete note:", err);
      showError("Failed to permanently delete note");
    }
  }

  // --- Refresh helpers ---

  async function refreshFolders() {
    try {
      const result = await fetchFolders();
      setFolders(result);
    } catch (err) {
      console.error("Failed to refresh folders:", err);
    }
  }

  async function refreshTags() {
    try {
      const result = await fetchTags();
      setTags(result);
    } catch (err) {
      console.error("Failed to refresh tags:", err);
    }
  }

  async function refreshSidebarData() {
    await Promise.all([refreshFolders(), refreshTags(), reloadNotes()]);
  }

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // --- Filter notes by active tags ---

  const filteredNotes = activeTags.length > 0
    ? notes.filter((n) => activeTags.every((t) => n.tags.includes(t)))
    : notes;

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`bg-sidebar flex flex-col shrink-0 overflow-hidden ${sidebarResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
        style={{ width: sidebarResize.size }}
      >
        {/* Sidebar header */}
        <div className="pl-4 pr-2 py-4 flex items-center justify-between">
          <h1 className="text-lg font-normal text-foreground">NoteSync</h1>
          <button
            onClick={handleCreate}
            className="w-7 h-7 flex items-center justify-center rounded bg-primary text-primary-contrast hover:bg-primary-hover transition-colors text-lg leading-none cursor-pointer"
            title="New note"
          >
            +
          </button>
        </div>

        {/* Search bar + tag browser */}
        <div className="px-2 pb-2">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search notes... (⌘K)"
              className="w-full px-3 py-1.5 rounded-md text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out"
            style={{
              maxHeight: searchFocused || activeTags.length > 0 || searchQuery ? "200px" : "0px",
              opacity: searchFocused || activeTags.length > 0 || searchQuery ? 1 : 0,
            }}
          >
            {tags.length > 0 && (
              <div className="pt-2">
                <TagBrowser
                  tags={tags}
                  activeTags={activeTags}
                  onToggleTag={handleToggleTag}
                  onRenameTag={handleRenameTag}
                  onDeleteTag={handleDeleteTag}
                />
              </div>
            )}
          </div>
        </div>

        {sidebarView === "notes" ? (
          <>
            {/* Folder tree (resizable) */}
            <div className="shrink-0 overflow-y-auto" style={{ height: folderResize.size }}>
              <FolderTree
                folders={folders}
                activeFolder={searchResults ? null : activeFolder}
                totalNotes={notes.length}
                onSelectFolder={(folderId) => {
                  setActiveFolder(folderId);
                  setSearchQuery("");
                  setSearchResults(null);
                }}
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

            {/* Notes header with sort controls */}
            <div className="px-2 py-1">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-sm text-muted-foreground uppercase tracking-wider">
                  {searchResults ? "Search Results" : "Notes"}
                </span>
                {!searchResults && (
                  <div className="flex items-center gap-1">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as NoteSortField)}
                      className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                      aria-label="Sort by"
                    >
                      <option value="updatedAt">Modified</option>
                      <option value="createdAt">Created</option>
                      <option value="title">Title</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title={sortOrder === "asc" ? "Ascending" : "Descending"}
                      aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
                    >
                      {sortOrder === "asc" ? "\u2191" : "\u2193"}
                    </button>
                    <button
                      onClick={handleCreate}
                      className="w-5 h-5 flex items-center justify-center rounded bg-subtle text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="New note"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Note list */}
            <nav className="flex-1 overflow-y-auto p-2" data-testid="note-list">
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : searchResults ? (
                searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No results found
                  </div>
                ) : (
                  <NoteList
                    notes={filteredNotes}
                    selectedId={selectedId}
                    onSelect={selectNote}
                    onDeleteNote={handleDeleteNote}
                    searchResults={searchResults}
                  />
                )
              ) : filteredNotes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No notes yet
                </div>
              ) : (
                <NoteList
                  notes={filteredNotes}
                  selectedId={selectedId}
                  onSelect={selectNote}
                  onDeleteNote={handleDeleteNote}
                />
              )}
            </nav>

            {/* Trash toggle */}
            <div className="px-4 py-3 border-t border-border flex items-center">
              <button
                onClick={handleViewTrash}
                className="relative flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Trash"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Trash view */}
            <div className="px-2 py-2 border-b border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground uppercase tracking-wider">
                Trash
              </span>
              <button
                onClick={() => setSidebarView("notes")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {trashNotes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Trash is empty
                </div>
              ) : (
                trashNotes.map((note) => (
                  <div key={note.id} className="flex items-center gap-1 mb-1">
                    <span className="flex-1 text-sm text-muted-foreground truncate px-2 py-1">
                      {note.title || "Untitled"}
                    </span>
                    <button
                      onClick={() => handleRestoreNote(note.id)}
                      className="shrink-0 px-1.5 py-0.5 rounded text-[11px] text-foreground hover:bg-accent transition-colors cursor-pointer"
                      title="Restore"
                    >
                      ↩
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(note.id)}
                      className="shrink-0 px-1.5 py-0.5 rounded text-[11px] text-destructive hover:bg-accent transition-colors cursor-pointer"
                      title="Delete permanently"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </nav>
          </>
        )}
      </aside>

      <ResizeDivider
        direction="vertical"
        isDragging={sidebarResize.isDragging}
        onPointerDown={sidebarResize.onPointerDown}
      />

      {/* Editor area */}
      <main className="flex-1 flex min-w-0 relative">
      <div className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <>
            {/* Toolbar status bar */}
            <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border shrink-0">
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === "saving"
                  ? "Saving..."
                  : isDirty()
                    ? "Unsaved"
                    : "Saved"}
              </span>
              <div className="flex-1" />
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-destructive">Delete?</span>
                  <button
                    onClick={handleDelete}
                    className="px-1.5 py-0.5 rounded bg-destructive text-foreground text-[11px] hover:bg-destructive-hover transition-colors cursor-pointer"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-1.5 py-0.5 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors cursor-pointer"
                  title="Delete"
                  aria-label="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              )}
            </div>

            {/* Title */}
            <div className="border-b border-border">
              <input
                data-title-input
                type="text"
                value={title}
                onChange={handleTitleChange}
                onFocus={(e) => {
                  if (e.target.value === "Untitled") {
                    setTitle("");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.trim() === "") {
                    setTitle("Untitled");
                    scheduleSave();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                    editorRef.current?.focus();
                  }
                }}
                placeholder="Note title"
                className="w-full px-4 py-3 bg-transparent text-xl text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {/* Tag input */}
            <TagInput
              tags={selectedNote.tags}
              allTags={tags.map((t) => t.name)}
              onChange={(newTags) => handleUpdateTags(selectedId!, newTags)}
            />

            {/* Toolbar */}
            <EditorToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBold={() => editorRef.current?.insertBold()}
              onItalic={() => editorRef.current?.insertItalic()}
              showLineNumbers={showLineNumbers}
              onToggleLineNumbers={() => setShowLineNumbers((prev) => !prev)}
            />

            {/* Content */}
            <div className="flex-1 flex min-h-0">
              {viewMode !== "preview" && (
                <MarkdownEditor
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onSave={handleSave}
                  showLineNumbers={showLineNumbers}
                  wordWrap={editorSettings.wordWrap}
                  tabSize={editorSettings.tabSize}
                  fontSize={editorSettings.editorFontSize}
                  theme={resolvedTheme}
                  accentColor={accentHex}
                  className={`${viewMode === "split" ? "shrink-0" : "flex-1"} overflow-auto`}
                  style={viewMode === "split" ? { width: splitResize.size } : undefined}
                />
              )}
              {viewMode === "split" && (
                <ResizeDivider
                  direction="vertical"
                  isDragging={splitResize.isDragging}
                  onPointerDown={splitResize.onPointerDown}
                />
              )}
              {viewMode !== "editor" && (
                <MarkdownPreview
                  content={content}
                  className={viewMode === "split" ? "flex-1 min-w-0 overflow-auto" : "flex-1"}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground">
              Select a note or create a new one
            </p>
          </div>
        )}
      </div>
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
