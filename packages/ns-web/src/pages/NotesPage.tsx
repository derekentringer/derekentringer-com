import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Note, NoteVersion, NoteSearchResult, NoteSortField, SortOrder, FolderInfo, TagInfo, NoteTitleEntry } from "@derekentringer/shared/ns";
import { useAuth } from "../context/AuthContext.tsx";
import {
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  fetchFolders,
  fetchTags,
  fetchTrash,
  restoreNote as apiRestoreNote,
  permanentDeleteNote as apiPermanentDeleteNote,
  emptyTrash as apiEmptyTrash,
  createFolderApi,
  reorderNotes as apiReorderNotes,
  renameFolderApi,
  deleteFolderApi,
  moveFolderApi,
  renameTagApi,
  deleteTagApi,
  fetchNoteTitles,
  restoreVersion,
  fetchFavoriteNotes,
  toggleFolderFavoriteApi,
} from "../api/offlineNotes.ts";
import { useOfflineCache } from "../hooks/useOfflineCache.ts";
import { OnlineStatusIndicator } from "../components/OnlineStatusIndicator.tsx";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "../components/MarkdownEditor.tsx";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";
import {
  EditorToolbar,
  type ViewMode,
} from "../components/EditorToolbar.tsx";
import { FolderTree, flattenFolderTree, getFolderBreadcrumb } from "../components/FolderTree.tsx";
import { NoteList } from "../components/NoteList.tsx";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import { TagBrowser } from "../components/TagBrowser.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useAiSettings, type CompletionStyle } from "../hooks/useAiSettings.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";
import { ghostTextExtension, continueWritingKeymap } from "../editor/ghostText.ts";
import { rewriteExtension } from "../editor/rewriteMenu.ts";
import { wikiLinkAutocomplete } from "../editor/wikiLinkComplete.ts";
import { fetchCompletion, summarizeNote, suggestTags as suggestTagsApi, rewriteText } from "../api/ai.ts";
import { AudioRecorder } from "../components/AudioRecorder.tsx";
import { QAPanel } from "../components/QAPanel.tsx";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.tsx";
import { DiffView } from "../components/DiffView.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { BacklinksPanel } from "../components/BacklinksPanel.tsx";
import { ImportButton } from "../components/ImportButton.tsx";
import {
  parseFileList,
  importFiles,
  exportNoteAsMarkdown,
  exportNoteAsText,
  exportNoteAsPdf,
  exportNotesAsZip,
  type ImportProgress,
  type ExportFormat,
} from "../lib/importExport.ts";

type SidebarView = "notes" | "trash";

export function NotesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { noteId: routeNoteId } = useParams<{ noteId?: string }>();
  const { settings } = useAiSettings();
  const { settings: editorSettings } = useEditorSettings();
  const { isOnline, lastSyncedAt, pendingCount, isSyncing, reconciledIds } = useOfflineCache();

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
  const [viewMode, setViewMode] = useState<ViewMode>(editorSettings.defaultViewMode);
  const [showLineNumbers, setShowLineNumbers] = useState(editorSettings.showLineNumbers);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  // Note sort state
  const [sortBy, setSortBy] = useState<NoteSortField>("sortOrder");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Folder state
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [allNotesCount, setAllNotesCount] = useState(0);

  // Tag state
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Favorites state
  const [favoriteNotes, setFavoriteNotes] = useState<Note[]>([]);

  // Trash state
  const [sidebarView, setSidebarView] = useState<SidebarView>("notes");
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [confirmDeleteSummary, setConfirmDeleteSummary] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<"all" | "selected" | null>(null);

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic" | "hybrid">(settings.semanticSearch ? "hybrid" : "keyword");

  // Folder dropdown state
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) {
        setShowFolderDropdown(false);
      }
    }
    if (showFolderDropdown) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showFolderDropdown]);

  // Import/export state
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Note titles state (for wiki-link autocomplete)
  const [noteTitles, setNoteTitles] = useState<NoteTitleEntry[]>([]);
  const noteTitlesRef = useRef<NoteTitleEntry[]>([]);
  noteTitlesRef.current = noteTitles;

  // Copy link state
  const [linkCopied, setLinkCopied] = useState(false);

  // AI state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);

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
  const splitResize = useResizable({
    direction: "vertical",
    initialSize: 500,
    minSize: 200,
    maxSize: 1200,
    storageKey: "ns-split-width",
  });

  // Drawer state (shared by AI Assistant and Version History)
  type DrawerTab = "assistant" | "history";
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("assistant");
  const [qaOpen, setQaOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const qaResize = useResizable({
    direction: "vertical",
    initialSize: 350,
    minSize: 250,
    maxSize: 600,
    storageKey: "ns-qa-panel-width",
    invert: true,
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
        const folderIdParam =
          !searchQuery && activeFolder && activeFolder !== "__unfiled__"
            ? activeFolder
            : undefined;
        const result = await fetchNotes({
          search: searchQuery || undefined,
          searchMode: searchQuery && settings.semanticSearch ? searchMode : undefined,
          folderId: folderIdParam,
          tags: activeTags.length > 0 ? activeTags : undefined,
          sortBy,
          sortOrder,
        });
        let filtered = result.notes;
        // Client-side filter for "unfiled" (notes with no folder) — skip during search
        if (!searchQuery && activeFolder === "__unfiled__") {
          filtered = filtered.filter((n) => !n.folderId);
        }
        setNotes(filtered);
      } catch {
        showError("Failed to load notes");
      } finally {
        setIsLoading(false);
      }
    },
    [sortBy, sortOrder, activeFolder, activeTags, searchMode, settings.semanticSearch],
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

  const loadNoteTitles = useCallback(async () => {
    try {
      const result = await fetchNoteTitles();
      setNoteTitles(result.notes);
    } catch {
      // Silent fail
    }
  }, []);

  const loadFavoriteNotes = useCallback(async () => {
    try {
      const result = await fetchFavoriteNotes();
      setFavoriteNotes(result.notes);
    } catch {
      // Silent fail
    }
  }, []);

  const favoriteFolders = useMemo(() => {
    const result: FolderInfo[] = [];
    function collect(items: FolderInfo[]) {
      for (const f of items) {
        if (f.favorite) result.push(f);
        collect(f.children);
      }
    }
    collect(folders);
    return result;
  }, [folders]);

  // Load notes on mount and when search/sort/folder/mode changes
  useEffect(() => {
    loadNotes(debouncedSearch || undefined);
  }, [debouncedSearch, loadNotes]);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Load note titles on mount
  useEffect(() => {
    loadNoteTitles();
  }, [loadNoteTitles]);

  // Load favorite notes on mount
  useEffect(() => {
    loadFavoriteNotes();
  }, [loadFavoriteNotes]);

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

  // Reconcile temp IDs after offline sync
  useEffect(() => {
    if (reconciledIds.size === 0) return;
    setNotes((prev) =>
      prev.map((n) => {
        const realId = reconciledIds.get(n.id);
        return realId ? { ...n, id: realId } : n;
      }),
    );
    setSelectedId((prev) =>
      prev && reconciledIds.has(prev) ? reconciledIds.get(prev)! : prev,
    );
    loadNotes(debouncedSearch || undefined);
  }, [reconciledIds]);

  // Deep-link: navigate to note from URL on mount
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (!routeNoteId || deepLinkHandled.current || isLoading) return;
    deepLinkHandled.current = true;

    // Try to find the note in the already-loaded list
    const found = notes.find((n) => n.id === routeNoteId);
    if (found) {
      selectNote(found);
    } else {
      // Fetch the specific note
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(routeNoteId)
          .then((note) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === note.id)) return prev;
              return [note, ...prev];
            });
            selectNote(note);
          })
          .catch(() => {
            showError("Note not found");
            navigate("/", { replace: true });
          });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeNoteId, isLoading]);

  const selectedNote =
    sidebarView === "notes"
      ? notes.find((n) => n.id === selectedId) ?? null
      : trashNotes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    document.title = selectedNote ? `${selectedNote.title} — NoteSync` : "NoteSync";
    return () => { document.title = "NoteSync"; };
  }, [selectedNote]);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  function selectNote(note: Note) {
    if (isDirty && selectedId) {
      // Fire-and-forget save of current note before switching
      updateNote(selectedId, { title, content }).catch(() => {});
    }
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setIsDirty(false);
    setConfirmDelete(false);
    setConfirmPermanentDelete(false);
    setLinkCopied(false);
    setSelectedVersion(null);
    if (qaOpen && drawerTab === "history") {
      setQaOpen(false);
    }
    navigate(`/notes/${note.id}`, { replace: true });
  }

  async function handleCreate() {
    try {
      const folderId =
        activeFolder && activeFolder !== "__unfiled__"
          ? activeFolder
          : undefined;
      const note = await createNote({ title: "Untitled", folderId });
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
      loadFolders();
      loadNoteTitles();
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
      setFavoriteNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? { ...n, title: updated.title, content: updated.content } : n)),
      );
      setIsDirty(false);
      loadNoteTitles();
    } catch {
      showError("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [selectedId, isDirty, isSaving, title, content, loadNoteTitles]);

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
      loadNoteTitles();
      navigate("/", { replace: true });
    } catch {
      showError("Failed to delete note");
    }
  }

  async function handleDeleteNoteById(noteId: string) {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedId === noteId) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        setIsDirty(false);
        setConfirmDelete(false);
      }
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Folder → Folder (nesting) or Folder → Root
    if (activeId.startsWith("drag-folder:")) {
      const folderId = activeId.slice("drag-folder:".length);
      if (overId.startsWith("folder:")) {
        const targetId = overId.slice("folder:".length);
        const newParentId =
          targetId === "__root__" || targetId === "__unfiled__"
            ? null
            : targetId;
        // Don't move to self
        if (folderId === newParentId) return;
        try {
          await moveFolderApi(folderId, newParentId);
          loadFolders();
        } catch {
          showError("Failed to move folder");
        }
      }
      return;
    }

    // Note → Folder
    if (overId.startsWith("folder:")) {
      const noteId = activeId;
      const folderTarget = overId.slice("folder:".length);
      const folderId =
        folderTarget === "__unfiled__" || folderTarget === "__root__"
          ? null
          : folderTarget;

      try {
        const updated = await updateNote(noteId, { folderId });
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
        loadNotes(debouncedSearch || undefined);
        loadFolders();
      } catch {
        showError("Failed to move note");
      }
      return;
    }

    // Note reorder
    if (active.id !== over.id) {
      handleReorder(activeId, overId);
    }
  }

  async function handleCreateFolder(name: string, parentId?: string) {
    if (!isOnline) { showError("Folder operations require a connection"); return; }
    try {
      const result = await createFolderApi(name, parentId);
      const foldersResult = await fetchFolders();
      setFolders(foldersResult.folders);
      setActiveFolder(result.id);
    } catch {
      showError("Failed to create folder");
    }
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    if (!isOnline) { showError("Folder operations require a connection"); return; }
    try {
      await renameFolderApi(folderId, newName);
      loadFolders();
      loadNotes(debouncedSearch || undefined);
    } catch {
      showError("Failed to rename folder");
    }
  }

  async function handleMoveFolder(folderId: string, parentId: string | null) {
    if (!isOnline) { showError("Folder operations require a connection"); return; }
    try {
      await moveFolderApi(folderId, parentId);
      loadFolders();
    } catch {
      showError("Failed to move folder");
    }
  }

  function handleToggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleRenameTag(oldName: string, newName: string) {
    if (!isOnline) { showError("Tag operations require a connection"); return; }
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
    if (!isOnline) { showError("Tag operations require a connection"); return; }
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

  async function handleDeleteFolder(
    folderId: string,
    mode: "move-up" | "recursive",
  ) {
    if (!isOnline) { showError("Folder operations require a connection"); return; }
    try {
      await deleteFolderApi(folderId, mode);
      if (activeFolder === folderId) {
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
    setSelectedTrashIds(new Set());
    navigate("/", { replace: true });
  }

  function switchToNotes() {
    setSidebarView("notes");
    setSelectedId(null);
    setTitle("");
    setContent("");
    setIsDirty(false);
    setConfirmPermanentDelete(false);
    setSelectedTrashIds(new Set());
    navigate("/", { replace: true });
  }

  function toggleTrashSelect(id: string) {
    setSelectedTrashIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedTrashIds.size === trashNotes.length) {
      setSelectedTrashIds(new Set());
    } else {
      setSelectedTrashIds(new Set(trashNotes.map((n) => n.id)));
    }
  }

  async function handleEmptyTrash() {
    try {
      await apiEmptyTrash();
      setTrashNotes([]);
      setTrashTotal(0);
      setSelectedId(null);
      setTitle("");
      setContent("");
      setSelectedTrashIds(new Set());
      setConfirmBulkDelete(null);
    } catch {
      showError("Failed to empty trash");
    }
  }

  async function handleDeleteSelected() {
    try {
      const ids = [...selectedTrashIds];
      const result = await apiEmptyTrash(ids);
      setTrashNotes((prev) => prev.filter((n) => !selectedTrashIds.has(n.id)));
      setTrashTotal((prev) => prev - result.deleted);
      if (selectedId && selectedTrashIds.has(selectedId)) {
        setSelectedId(null);
        setTitle("");
        setContent("");
      }
      setSelectedTrashIds(new Set());
      setConfirmBulkDelete(null);
    } catch {
      showError("Failed to delete selected notes");
    }
  }

  // Import/export handlers
  async function handleImportFiles(files: FileList, autoSelect = false) {
    const entries = parseFileList(files);
    if (entries.length === 0) {
      showError("No supported files found (.md, .txt, .markdown)");
      return;
    }
    const targetFolderId = activeFolder && activeFolder !== "__unfiled__" ? activeFolder : null;
    let lastCreatedNote: NoteSearchResult | null = null;
    const wrappedCreateNote = async (data: { title: string; content: string; folderId?: string }) => {
      const note = await createNote(data);
      lastCreatedNote = note;
      return note;
    };
    const result = await importFiles(
      entries,
      targetFolderId,
      folders,
      wrappedCreateNote,
      createFolderApi,
      (progress) => setImportProgress(progress),
    );
    setImportProgress(null);
    loadNotes(debouncedSearch || undefined);
    loadFolders();
    if (autoSelect && lastCreatedNote && result.successCount > 0) {
      selectNote(lastCreatedNote);
    }
    if (result.failedCount > 0) {
      showError(`Imported ${result.successCount}, failed ${result.failedCount}`);
    } else {
      setSuccessToast(`Imported ${result.successCount} note${result.successCount === 1 ? "" : "s"}`);
      setTimeout(() => setSuccessToast(null), 3000);
    }
  }

  function handleExportNote(noteId: string, format: ExportFormat = "md") {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (format === "txt") {
      exportNoteAsText(note);
    } else if (format === "pdf") {
      import("marked").then(({ marked }) => {
        exportNoteAsPdf(note, (md) => marked(md) as string);
      });
    } else {
      exportNoteAsMarkdown(note);
    }
  }

  async function handleExportFolder(folderId: string) {
    const folder = findFolderById(folders, folderId);
    if (!folder) return;
    // Collect all folder IDs in this subtree
    const folderIds = new Set<string>();
    function collectIds(f: FolderInfo) {
      folderIds.add(f.id);
      f.children.forEach(collectIds);
    }
    collectIds(folder);
    // Fetch all notes, then filter to ones in these folders
    try {
      const allResult = await fetchNotes({ pageSize: 10000 });
      const folderNotes = allResult.notes.filter((n) => n.folderId && folderIds.has(n.folderId));
      if (folderNotes.length === 0) {
        showError("No notes in this folder to export");
        return;
      }
      await exportNotesAsZip(folderNotes, folders, folder.name);
    } catch {
      showError("Failed to export folder");
    }
  }

  function findFolderById(items: FolderInfo[], id: string): FolderInfo | undefined {
    for (const f of items) {
      if (f.id === id) return f;
      const found = findFolderById(f.children, id);
      if (found) return found;
    }
    return undefined;
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (mainRef.current?.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleImportFiles(e.dataTransfer.files, true);
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

  // Autosave: debounce after changes
  useEffect(() => {
    if (!isDirty || !selectedId) return;

    const timer = setTimeout(() => {
      handleSave();
    }, editorSettings.autoSaveDelay);

    return () => clearTimeout(timer);
  }, [isDirty, title, content, selectedId, handleSave, editorSettings.autoSaveDelay]);

  const flatFolders = useMemo(() => flattenFolderTree(folders), [folders]);

  // Resolve "system" theme to actual "dark" or "light" for CodeMirror
  const resolvedTheme = useMemo((): "dark" | "light" => {
    if (editorSettings.theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return editorSettings.theme;
  }, [editorSettings.theme]);

  const resolvedAccentColor = useMemo(
    () => resolveAccentColor(editorSettings.accentColor, resolvedTheme),
    [editorSettings.accentColor, resolvedTheme],
  );

  const aiExtensions = useMemo(
    () => {
      if (!settings.masterAiEnabled) return [];
      return [
        ...(settings.rewrite ? [rewriteExtension(rewriteText)] : []),
        ...(settings.completions
          ? [ghostTextExtension((ctx, sig) => fetchCompletion(ctx, sig, settings.completionStyle), settings.completionDebounceMs)]
          : []),
        ...(settings.continueWriting
          ? [continueWritingKeymap((ctx, sig, style) => fetchCompletion(ctx, sig, style as CompletionStyle), () => titleRef.current)]
          : []),
      ];
    },
    [settings.masterAiEnabled, settings.rewrite, settings.completions, settings.completionStyle, settings.completionDebounceMs, settings.continueWriting],
  );

  // Wiki-link title map for preview rendering
  const wikiLinkTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of noteTitles) {
      map.set(t.title.toLowerCase(), t.id);
    }
    return map;
  }, [noteTitles]);

  // Wiki-link autocomplete extension (stable, reads from ref)
  const wikiLinkExt = useMemo(
    () => wikiLinkAutocomplete(() => noteTitlesRef.current),
    [],
  );

  async function handleToggleNoteFavorite(noteId: string, favorite: boolean) {
    try {
      const updated = await updateNote(noteId, { favorite });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? { ...n, favorite: updated.favorite } : n)),
      );
      loadFavoriteNotes();
    } catch {
      showError("Failed to update favorite");
    }
  }

  async function handleToggleFolderFavorite(folderId: string, favorite: boolean) {
    try {
      await toggleFolderFavoriteApi(folderId, favorite);
      loadFolders();
    } catch {
      showError("Failed to update favorite");
    }
  }

  function handleFavoriteNoteClick(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      selectNote(note);
    } else {
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(noteId)
          .then((fetched) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === fetched.id)) return prev;
              return [fetched, ...prev];
            });
            selectNote(fetched);
          })
          .catch(() => showError("Favorited note not found"));
      });
    }
  }

  function handleWikiLinkClick(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      selectNote(note);
    } else {
      // Note may not be in the current list, fetch it
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(noteId)
          .then((fetched) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === fetched.id)) return prev;
              return [fetched, ...prev];
            });
            selectNote(fetched);
          })
          .catch(() => showError("Linked note not found"));
      });
    }
  }

  function handleCopyLink() {
    if (!selectedId) return;
    const url = `${window.location.origin}/notes/${selectedId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  async function handleSummarize() {
    if (!selectedId || isSummarizing) return;
    setIsSummarizing(true);
    try {
      // Save first so the API has fresh content
      if (isDirty) {
        await updateNote(selectedId, { title, content });
        setIsDirty(false);
      }
      const summary = await summarizeNote(selectedId);
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, summary } : n)),
      );
    } catch {
      showError("Failed to generate summary");
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleDeleteSummary() {
    if (!selectedId) return;
    try {
      await updateNote(selectedId, { summary: null });
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, summary: null } : n)),
      );
    } catch {
      showError("Failed to delete summary");
    }
  }

  async function handleSuggestTags() {
    if (!selectedId || isSuggestingTags) return;
    setIsSuggestingTags(true);
    try {
      // Save first so the API has fresh content
      if (isDirty) {
        await updateNote(selectedId, { title, content });
        setIsDirty(false);
      }
      const tags = await suggestTagsApi(selectedId);
      setSuggestedTags(tags);
    } catch {
      showError("Failed to suggest tags");
    } finally {
      setIsSuggestingTags(false);
    }
  }

  async function handleAcceptTag(tag: string) {
    if (!selectedId || !selectedNote) return;
    const currentTags = selectedNote.tags ?? [];
    if (currentTags.includes(tag)) {
      setSuggestedTags((prev) => prev.filter((t) => t !== tag));
      return;
    }
    try {
      const newTags = [...currentTags, tag];
      const updated = await updateNote(selectedId, { tags: newTags });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n)),
      );
      setSuggestedTags((prev) => prev.filter((t) => t !== tag));
      loadFolders();
    } catch {
      showError("Failed to add tag");
    }
  }

  function handleDismissTag(tag: string) {
    setSuggestedTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleAudioNoteCreated(note: Note) {
    setNotes((prev) => [note, ...prev]);
    selectNote(note);
    loadFolders();
  }

  // Clear suggested tags when switching notes
  useEffect(() => {
    setSuggestedTags([]);
  }, [selectedId]);

  // Close Q&A panel when setting is disabled
  useEffect(() => {
    if (!settings.qaAssistant) {
      setQaOpen(false);
    }
  }, [settings.qaAssistant]);

  function handleDrawerTabClick(tab: DrawerTab) {
    if (qaOpen && drawerTab === tab) {
      setQaOpen(false);
    } else {
      setDrawerTab(tab);
      setQaOpen(true);
    }
  }

  async function handleVersionRestore(noteId: string, versionId: string) {
    try {
      const updated = await restoreVersion(noteId, versionId);
      setTitle(updated.title);
      setContent(updated.content);
      setIsDirty(false);
      setSelectedVersion(null);

      // Update the note in the list
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)),
      );

      setSuccessToast("Version restored");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {
      setError("Failed to restore version");
    }
  }

  function handleQaSelectNote(noteId: string) {
    // Switch to notes view if in trash
    if (sidebarView === "trash") {
      setSidebarView("notes");
      setConfirmPermanentDelete(false);
    }
    // Find the note in the current list
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      selectNote(note);
    } else {
      // Note may not be loaded (different folder/search), so reload and select
      loadNotes().then(() => {
        // After reload, try to find and select
        setSelectedId(noteId);
      });
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="bg-sidebar flex flex-col shrink-0" style={{ width: sidebarResize.size }}>
        <div className="pl-4 pr-2 py-4 flex items-center justify-between">
          <h1 className="text-lg font-normal text-foreground">NoteSync</h1>
          {sidebarView === "notes" && (
            <div className="flex items-center gap-1.5">
              {settings.masterAiEnabled && settings.audioNotes && (
                <AudioRecorder
                  defaultMode={settings.audioMode}
                  onNoteCreated={handleAudioNoteCreated}
                  onError={showError}
                />
              )}
              <button
                onClick={handleCreate}
                className="w-7 h-7 flex items-center justify-center rounded bg-primary text-primary-contrast hover:bg-primary-hover transition-colors text-lg leading-none"
                title="New note"
              >
                +
              </button>
            </div>
          )}
        </div>

        {sidebarView === "notes" ? (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="p-2">
              <div className="relative flex items-center rounded-md bg-input border border-border focus-within:ring-2 focus-within:ring-ring">
                {settings.masterAiEnabled && settings.semanticSearch && (
                  <select
                    value={searchMode}
                    onChange={(e) => setSearchMode(e.target.value as "keyword" | "semantic" | "hybrid")}
                    className="bg-transparent border-none border-r border-border text-[11px] text-muted-foreground pl-2 pr-0 py-1.5 focus:outline-none cursor-pointer appearance-none"
                    style={{ backgroundImage: "none" }}
                    aria-label="Search mode"
                    data-testid="search-mode-select"
                  >
                    <option value="keyword">Keyword</option>
                    <option value="semantic">Semantic</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className={`flex-1 bg-transparent py-1.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${settings.semanticSearch ? "pl-1" : "pl-3"}`}
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
              {(favoriteFolders.length > 0 || favoriteNotes.length > 0) && (
                <FavoritesPanel
                  favoriteFolders={favoriteFolders}
                  favoriteNotes={favoriteNotes}
                  activeFolder={activeFolder}
                  selectedNoteId={selectedId}
                  onSelectFolder={setActiveFolder}
                  onSelectNote={handleFavoriteNoteClick}
                  onUnfavoriteFolder={(id) => handleToggleFolderFavorite(id, false)}
                  onUnfavoriteNote={(id) => handleToggleNoteFavorite(id, false)}
                />
              )}
              <FolderTree
                folders={folders}
                activeFolder={activeFolder}
                totalNotes={allNotesCount}
                onSelectFolder={setActiveFolder}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveFolder={handleMoveFolder}
                onExportFolder={handleExportFolder}
                onToggleFavorite={handleToggleFolderFavorite}
              />
            </div>

            <ResizeDivider
              direction="horizontal"
              isDragging={folderResize.isDragging}
              onPointerDown={folderResize.onPointerDown}
            />

            <div className="px-2 py-1">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-sm text-muted-foreground uppercase tracking-wider">
                  {debouncedSearch ? "Search Results" : "Notes"}
                </span>
                {!debouncedSearch && (
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
                )}
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
                  onDeleteNote={handleDeleteNoteById}
                  onExportNote={handleExportNote}
                  onToggleFavorite={handleToggleNoteFavorite}
                  sortByManual={sortBy === "sortOrder"}
                />
              )}
            </nav>
          </DndContext>
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

            {trashNotes.length > 0 && (
              <div className="px-2 pb-1 flex items-center gap-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedTrashIds.size === trashNotes.length}
                    onChange={toggleSelectAll}
                    className="mr-1.5 accent-primary"
                    aria-label="Select all"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedTrashIds.size > 0
                      ? `${selectedTrashIds.size} selected`
                      : `${trashNotes.length} items`}
                  </span>
                </label>
                <div className="flex-1" />
                {selectedTrashIds.size > 0 ? (
                  <button
                    onClick={() => setConfirmBulkDelete("selected")}
                    className="text-xs text-destructive hover:text-destructive-hover transition-colors"
                  >
                    Delete Selected ({selectedTrashIds.size})
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmBulkDelete("all")}
                    className="text-xs text-destructive hover:text-destructive-hover transition-colors"
                  >
                    Delete All
                  </button>
                )}
              </div>
            )}

            <nav className="flex-1 overflow-y-auto p-2">
              {trashNotes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Trash is empty
                </div>
              ) : (
                trashNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`flex items-center gap-1.5 rounded-md text-sm transition-colors ${
                      note.id === selectedId
                        ? "bg-accent text-foreground"
                        : "text-muted hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTrashIds.has(note.id)}
                      onChange={() => toggleTrashSelect(note.id)}
                      className="ml-2 shrink-0 accent-primary"
                      aria-label={`Select ${note.title || "Untitled"}`}
                    />
                    <button
                      onClick={() => selectNote(note)}
                      className="flex-1 text-left px-1 py-2 truncate"
                    >
                      {note.title || "Untitled"}
                    </button>
                  </div>
                ))
              )}
            </nav>
          </>
        )}

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OnlineStatusIndicator
              isOnline={isOnline}
              pendingCount={pendingCount}
              lastSyncedAt={lastSyncedAt}
            />
            {sidebarView === "notes" && (
              <>
                <button
                  onClick={switchToTrash}
                  className="relative flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Trash"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  {trashTotal > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-0.5 rounded-full bg-border text-[10px] text-muted-foreground">
                      {trashTotal}
                    </span>
                  )}
                </button>
                <ImportButton
                  onImportFiles={(files) => handleImportFiles(files)}
                  onImportDirectory={(files) => handleImportFiles(files)}
                />
              </>
            )}
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            {user?.role === "admin" && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Admin"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </button>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Sign out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      <ResizeDivider
        direction="vertical"
        isDragging={sidebarResize.isDragging}
        onPointerDown={sidebarResize.onPointerDown}
      />

      {/* Editor area */}
      <main
        ref={mainRef}
        className="flex-1 flex min-w-0 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFileDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-lg pointer-events-none">
            <span className="text-lg text-primary font-medium">Drop files to import</span>
          </div>
        )}
        <div className="flex-1 flex flex-col min-w-0">
        {selectedNote && sidebarView === "notes" ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
              <span className="text-xs text-muted-foreground">
                {isSyncing
                  ? "Syncing..."
                  : isSaving
                    ? "Saving..."
                    : isDirty
                      ? "Unsaved changes"
                      : "Saved"}
              </span>
              <div className="flex-1" />
              {settings.masterAiEnabled && settings.summarize && (
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="px-2 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  title="Summarize note"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>
                  {isSummarizing ? "Summarizing..." : "Summarize"}
                </button>
              )}
              {settings.masterAiEnabled && settings.tagSuggestions && (
                <button
                  onClick={handleSuggestTags}
                  disabled={isSuggestingTags}
                  className="px-2 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  title="Suggest tags"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  {isSuggestingTags ? "Suggesting..." : "Suggest tags"}
                </button>
              )}
              <button
                onClick={handleCopyLink}
                className="px-2 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors flex items-center gap-1"
                title="Copy link to note"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                {linkCopied ? "Copied!" : "Copy link"}
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

            {/* Breadcrumb + Title */}
            <div className="relative border-b border-border">
              <div className="absolute left-1.5 bottom-1.5" ref={folderDropdownRef}>
                <button
                  onClick={() => setShowFolderDropdown((v) => !v)}
                  className="w-8 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title={selectedNote?.folderId ? flatFolders.find((f) => f.id === selectedNote.folderId)?.displayName ?? "Unfiled" : "Unfiled"}
                  aria-label="Note folder"
                  data-testid="note-folder-select"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                {showFolderDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[140px]">
                    {[{ id: "", displayName: "Unfiled" }, ...flatFolders].map((f) => (
                      <button
                        key={f.id}
                        onClick={async () => {
                          const folderId = f.id || null;
                          setShowFolderDropdown(false);
                          if (!selectedId) return;
                          try {
                            const updated = await updateNote(selectedId, { folderId });
                            setNotes((prev) =>
                              prev.map((n) => (n.id === updated.id ? updated : n)),
                            );
                            loadNotes(debouncedSearch || undefined);
                            loadFolders();
                          } catch {
                            showError("Failed to move note");
                          }
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          (selectedNote?.folderId ?? "") === f.id
                            ? "text-foreground bg-accent"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {f.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                    handleSave();
                    editorRef.current?.focus();
                  }
                }}
                placeholder="Note title"
                className="w-full px-4 py-3 bg-transparent text-xl text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <p className="pl-9 pr-4 pb-1.5 -mt-1 text-[10px] text-muted-foreground truncate">
                {selectedNote?.folderId
                  ? getFolderBreadcrumb(folders, selectedNote.folderId).map((f) => f.name).join(" / ")
                  : "Unfiled"}
              </p>
            </div>

            {/* Summary */}
            {selectedNote?.summary && (
              <div className="relative px-4 py-2 text-sm text-muted-foreground border-b border-border italic pr-8">
                {selectedNote.summary}
                <button
                  onClick={() => setConfirmDeleteSummary(true)}
                  className="absolute top-1.5 right-2 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Remove summary"
                >
                  &times;
                </button>
              </div>
            )}
            {confirmDeleteSummary && (
              <ConfirmDialog
                title="Delete Summary"
                message={selectedNote?.title || "Untitled"}
                onConfirm={() => {
                  handleDeleteSummary();
                  setConfirmDeleteSummary(false);
                }}
                onCancel={() => setConfirmDeleteSummary(false)}
              />
            )}

            {/* Tags */}
            <TagInput
              tags={selectedNote?.tags ?? []}
              allTags={tags.map((t) => t.name)}
              onChange={handleTagsChange}
            />

            {/* Suggested tags */}
            {suggestedTags.length > 0 && (
              <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Suggested:</span>
                {suggestedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-xs text-foreground border border-border"
                  >
                    {tag}
                    <button
                      onClick={() => handleAcceptTag(tag)}
                      className="text-primary hover:text-primary-hover transition-colors"
                      title="Accept tag"
                    >
                      +
                    </button>
                    <button
                      onClick={() => handleDismissTag(tag)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {selectedVersion ? (
              <DiffView
                version={selectedVersion}
                currentTitle={title}
                currentContent={content}
                onRestore={() => handleVersionRestore(selectedId!, selectedVersion.id)}
                onClose={() => setSelectedVersion(null)}
              />
            ) : (
            <>
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
                  wordWrap={editorSettings.wordWrap}
                  tabSize={editorSettings.tabSize}
                  fontSize={editorSettings.editorFontSize}
                  theme={resolvedTheme}
                  accentColor={resolvedAccentColor}
                  extensions={[wikiLinkExt, ...aiExtensions]}
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
                  wikiLinkTitleMap={wikiLinkTitleMap}
                  onWikiLinkClick={handleWikiLinkClick}
                />
              )}
            </div>

            {/* Backlinks panel */}
            {selectedId && (
              <BacklinksPanel
                noteId={selectedId}
                onNavigate={handleWikiLinkClick}
              />
            )}
            </>
            )}
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
                className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors"
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground">
              {sidebarView === "trash"
                ? "Select a note to preview"
                : "Select a note or create a new one"}
            </p>
          </div>
        )}
        </div>

      </main>

      {/* Sliding drawer with tabbed content */}
      <div
        className="fixed top-0 right-0 h-full z-10 overflow-visible transition-transform duration-300 ease-in-out"
        style={{
          width: qaResize.size,
          transform: qaOpen ? "translateX(0)" : `translateX(${qaResize.size}px)`,
        }}
      >
        {/* Tab buttons on left edge, above backlinks panel */}
        <div className="absolute right-full flex flex-col gap-1" style={{ bottom: 38 }}>
          {/* AI Assistant tab */}
          {settings.masterAiEnabled && settings.qaAssistant && (
            <button
              onClick={() => handleDrawerTabClick("assistant")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors ${
                qaOpen && drawerTab === "assistant"
                  ? "bg-primary text-primary-contrast"
                  : "bg-card text-muted-foreground border border-r-0 border-border hover:text-foreground hover:bg-muted"
              }`}
              title="AI Assistant"
              data-testid="drawer-tab-assistant"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
          {/* Version History tab */}
          {selectedId && sidebarView === "notes" && (
            <button
              onClick={() => handleDrawerTabClick("history")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors ${
                qaOpen && drawerTab === "history"
                  ? "bg-primary text-primary-contrast"
                  : "bg-card text-muted-foreground border border-r-0 border-border hover:text-foreground hover:bg-muted"
              }`}
              title="Version History"
              data-testid="drawer-tab-history"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          )}
        </div>
        <div className="h-full flex bg-card shadow-lg">
          <ResizeDivider
            direction="vertical"
            isDragging={qaResize.isDragging}
            onPointerDown={qaResize.onPointerDown}
          />
          <div className="flex-1 min-w-0 h-full">
            {drawerTab === "assistant" && settings.masterAiEnabled && settings.qaAssistant ? (
              <QAPanel onSelectNote={handleQaSelectNote} isOpen={qaOpen} />
            ) : drawerTab === "history" && selectedId ? (
              <VersionHistoryPanel
                noteId={selectedId}
                onSelectVersion={setSelectedVersion}
                selectedVersionId={selectedVersion?.id}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Import progress overlay */}
      {importProgress && (
        <div className="fixed bottom-4 right-4 bg-card border border-border rounded-md px-4 py-3 shadow-lg min-w-[240px]">
          <p className="text-sm text-foreground mb-1">
            Importing {importProgress.current} of {importProgress.total}...
          </p>
          <p className="text-xs text-muted-foreground truncate mb-2">{importProgress.currentFile}</p>
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all rounded-full"
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Success toast */}
      {successToast && (
        <div className="fixed bottom-4 right-4 bg-card border border-primary rounded-md px-4 py-3 shadow-lg flex items-center gap-3">
          <span className="text-sm text-foreground">{successToast}</span>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bulk delete confirm dialog */}
      {confirmBulkDelete && (
        <ConfirmDialog
          title={confirmBulkDelete === "all" ? "Empty Trash" : "Delete Selected"}
          message={
            confirmBulkDelete === "all"
              ? `Permanently delete all ${trashNotes.length} trashed note${trashNotes.length === 1 ? "" : "s"}? This cannot be undone.`
              : `Permanently delete ${selectedTrashIds.size} selected note${selectedTrashIds.size === 1 ? "" : "s"}? This cannot be undone.`
          }
          onConfirm={confirmBulkDelete === "all" ? handleEmptyTrash : handleDeleteSelected}
          onCancel={() => setConfirmBulkDelete(null)}
        />
      )}

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
