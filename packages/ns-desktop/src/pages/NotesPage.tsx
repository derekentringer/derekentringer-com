import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import type {
  Note,
  NoteSearchResult,
  FolderInfo,
  TagInfo,
  NoteSortField,
  SortOrder,
  NoteTitleEntry,
  NoteVersion,
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
  bulkHardDelete,
  emptyTrash,
  purgeOldTrash,
  initFts,
  reorderNotes,
  moveFolderParent,
  syncNoteLinks,
  listNoteTitles,
  fetchNoteById,
  captureVersion,
  restoreVersion,
  fetchFavoriteNotes,
  toggleFolderFavorite,
} from "../lib/db.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "../components/MarkdownEditor.tsx";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";
import { BacklinksPanel } from "../components/BacklinksPanel.tsx";
import {
  EditorToolbar,
  type ViewMode,
} from "../components/EditorToolbar.tsx";
import { NoteList } from "../components/NoteList.tsx";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import { FolderTree } from "../components/FolderTree.tsx";
import { TagBrowser } from "../components/TagBrowser.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.tsx";
import { DiffView } from "../components/DiffView.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";
import { wikiLinkAutocomplete } from "../editor/wikiLinkComplete.ts";

type SaveStatus = "idle" | "saving" | "saved";
type SidebarView = "notes" | "trash";
type DrawerTab = "history";

const TRASH_RETENTION_KEY = "ns-desktop:trashRetentionDays";
const TRASH_RETENTION_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days (default)" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 0, label: "Never" },
];

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

  // Favorites
  const [favoriteNotes, setFavoriteNotes] = useState<Note[]>([]);

  // Tags
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Sort
  const [sortBy, setSortBy] = useState<NoteSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Trash
  const [sidebarView, setSidebarView] = useState<SidebarView>("notes");
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<"all" | "selected" | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(() => {
    const stored = localStorage.getItem(TRASH_RETENTION_KEY);
    return stored !== null ? Number(stored) : 30;
  });

  // Note titles (for wiki-link autocomplete)
  const [noteTitles, setNoteTitles] = useState<NoteTitleEntry[]>([]);
  const noteTitlesRef = useRef<NoteTitleEntry[]>([]);
  noteTitlesRef.current = noteTitles;

  // Version history drawer
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("history");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [versionRefreshKey, setVersionRefreshKey] = useState(0);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  const drawerResize = useResizable({
    direction: "vertical",
    initialSize: 300,
    minSize: 200,
    maxSize: 500,
    storageKey: "ns-drawer-width",
    invert: true,
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
    // Load trash count for badge
    fetchTrash()
      .then((trash) => setTrashCount(trash.length))
      .catch(() => {});
  }, []);

  const loadNoteTitles = useCallback(async () => {
    try { setNoteTitles(await listNoteTitles()); } catch {}
  }, []);

  const loadFavoriteNotes = useCallback(async () => {
    try { setFavoriteNotes(await fetchFavoriteNotes()); } catch {}
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
      loadNoteTitles();
      loadFavoriteNotes();

      // Auto-purge old trash
      const retention = Number(localStorage.getItem(TRASH_RETENTION_KEY) ?? 30);
      if (retention > 0) {
        purgeOldTrash(retention).catch((err) =>
          console.error("Failed to purge old trash:", err),
        );
      }
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
    if (sidebarView !== "trash" && isDirty() && selectedId) {
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
    setConfirmPermanentDelete(false);
    setSelectedVersion(null);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  const handleSave = useCallback(async () => {
    if (!selectedId || !isDirty()) return;

    // Clear any pending autosave timer to prevent stale-closure overwrites
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

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

      // Fire-and-forget: sync wiki-links + refresh titles + capture version
      syncNoteLinks(selectedId, content).catch(() => {});
      captureVersion(selectedId, title, content, editorSettings.versionIntervalMinutes)
        .then(() => setVersionRefreshKey((k) => k + 1))
        .catch(() => {});
      loadNoteTitles();
    } catch (err) {
      console.error("Failed to save note:", err);
      showError("Failed to save note");
      setSaveStatus("idle");
    }
  }, [selectedId, title, content]);

  // Autosave: debounce after changes (useEffect ensures latest handleSave is always used)
  useEffect(() => {
    if (!isDirty() || !selectedId) return;

    saveTimerRef.current = setTimeout(() => {
      handleSave();
    }, editorSettings.autoSaveDelay);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [title, content, selectedId, handleSave, editorSettings.autoSaveDelay]);

  // --- CRUD handlers ---

  async function handleCreate() {
    try {
      const folderId =
        activeFolder && activeFolder !== "__unfiled__" ? activeFolder : undefined;
      const note = await createNote({ title: "Untitled", folderId });
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
      await refreshSidebarData();
      loadNoteTitles();
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
      setTrashCount((c) => c + 1);
      await refreshSidebarData();
      loadNoteTitles();
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note");
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await softDeleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setTrashCount((c) => c + 1);
      if (selectedId === noteId) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        loadedTitleRef.current = "";
        loadedContentRef.current = "";
      }
      await refreshSidebarData();
      loadNoteTitles();
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

  // --- Favorites ---

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
      const updatedFolders = await toggleFolderFavorite(folderId, favorite);
      setFolders(updatedFolders);
    } catch {
      showError("Failed to update favorite");
    }
  }

  function handleFavoriteNoteClick(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      selectNote(note);
      return;
    }
    fetchNoteById(noteId)
      .then((fetched) => {
        if (fetched) {
          setNotes((prev) =>
            prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev],
          );
          selectNote(fetched);
        }
      })
      .catch(() => showError("Favorited note not found"));
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

  // --- DnD handlers ---

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
        if (folderId === newParentId) return;
        try {
          await moveFolderParent(folderId, newParentId);
          await refreshFolders();
        } catch (err) {
          console.error("Failed to move folder:", err);
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
        await updateNote(noteId, { folderId });
        await refreshSidebarData();
      } catch (err) {
        console.error("Failed to move note:", err);
        showError("Failed to move note");
      }
      return;
    }

    // Note reorder (manual sort)
    if (active.id !== over.id) {
      await handleReorder(activeId, overId);
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
      await reorderNotes(
        updatedNotes.map((n) => ({ id: n.id, sortOrder: n.sortOrder })),
      );
    } catch (err) {
      console.error("Failed to reorder notes:", err);
      showError("Failed to reorder notes");
      await reloadNotes();
    }
  }

  async function handleMoveFolder(folderId: string, parentId: string | null) {
    try {
      await moveFolderParent(folderId, parentId);
      await refreshFolders();
    } catch (err) {
      console.error("Failed to move folder:", err);
      showError("Failed to move folder");
    }
  }

  // --- Trash ---

  async function handleViewTrash() {
    setSidebarView("trash");
    setSelectedId(null);
    setTitle("");
    setContent("");
    setSelectedTrashIds(new Set());
    setConfirmPermanentDelete(false);
    try {
      const trash = await fetchTrash();
      setTrashNotes(trash);
      setTrashCount(trash.length);
    } catch (err) {
      console.error("Failed to load trash:", err);
      showError("Failed to load trash");
    }
  }

  async function handleRestoreNote(noteId: string) {
    try {
      await restoreNote(noteId);
      setTrashNotes((prev) => prev.filter((n) => n.id !== noteId));
      setTrashCount((c) => Math.max(0, c - 1));
      if (selectedId === noteId) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        setConfirmPermanentDelete(false);
      }
      await refreshSidebarData();
      loadNoteTitles();
    } catch (err) {
      console.error("Failed to restore note:", err);
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
      await hardDeleteNote(selectedId);
      setTrashNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedTrashIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      setTrashCount((c) => Math.max(0, c - 1));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmPermanentDelete(false);
    } catch (err) {
      console.error("Failed to permanently delete note:", err);
      showError("Failed to permanently delete note");
    }
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
      await emptyTrash();
      setTrashNotes([]);
      setSelectedTrashIds(new Set());
      setConfirmBulkDelete(null);
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmPermanentDelete(false);
      setTrashCount(0);
    } catch (err) {
      console.error("Failed to empty trash:", err);
      showError("Failed to empty trash");
    }
  }

  async function handleDeleteSelected() {
    try {
      const ids = [...selectedTrashIds];
      await bulkHardDelete(ids);
      setTrashNotes((prev) => prev.filter((n) => !selectedTrashIds.has(n.id)));
      setTrashCount((c) => Math.max(0, c - ids.length));
      if (selectedId && selectedTrashIds.has(selectedId)) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        setConfirmPermanentDelete(false);
      }
      setSelectedTrashIds(new Set());
      setConfirmBulkDelete(null);
    } catch (err) {
      console.error("Failed to delete selected notes:", err);
      showError("Failed to delete selected notes");
    }
  }

  function handleRetentionChange(days: number) {
    setTrashRetentionDays(days);
    localStorage.setItem(TRASH_RETENTION_KEY, String(days));
    if (days > 0) {
      purgeOldTrash(days).then((purged) => {
        if (purged > 0 && sidebarView === "trash") {
          fetchTrash().then(setTrashNotes).catch(() => {});
        }
      }).catch((err) => console.error("Failed to purge trash:", err));
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

  const selectedNote = (sidebarView === "trash"
    ? trashNotes.find((n) => n.id === selectedId)
    : notes.find((n) => n.id === selectedId)) ?? null;

  // --- Wiki-link memoized values ---

  const wikiLinkTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of noteTitles) map.set(t.title.toLowerCase(), t.id);
    return map;
  }, [noteTitles]);

  const wikiLinkExt = useMemo(
    () => wikiLinkAutocomplete(() => noteTitlesRef.current),
    [],
  );

  function handleDrawerTabClick(tab: DrawerTab) {
    if (drawerOpen && drawerTab === tab) {
      setDrawerOpen(false);
    } else {
      setDrawerTab(tab);
      setDrawerOpen(true);
    }
  }

  async function handleVersionRestore(noteId: string, versionId: string) {
    try {
      const updated = await restoreVersion(noteId, versionId);
      setTitle(updated.title);
      setContent(updated.content);
      loadedTitleRef.current = updated.title;
      loadedContentRef.current = updated.content;
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setSelectedVersion(null);
      setSuccessToast("Version restored");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {
      showError("Failed to restore version");
    }
  }

  function handleWikiLinkClick(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      selectNote(note);
      return;
    }
    fetchNoteById(noteId)
      .then((fetched) => {
        if (fetched) {
          setNotes((prev) =>
            prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev],
          );
          selectNote(fetched);
        }
      })
      .catch(() => showError("Linked note not found"));
  }

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
          {sidebarView === "notes" && (
            <button
              onClick={handleCreate}
              className="w-7 h-7 flex items-center justify-center rounded bg-primary text-primary-contrast hover:bg-primary-hover transition-colors text-lg leading-none cursor-pointer"
              title="New note"
            >
              +
            </button>
          )}
        </div>

        {/* Search bar + tag browser (hidden in trash view) */}
        {sidebarView === "notes" && (
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
        )}

        {sidebarView === "notes" ? (
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {/* Favorites + Folder tree (resizable) */}
            <div className="shrink-0 overflow-y-auto" style={{ height: folderResize.size }}>
              {(favoriteFolders.length > 0 || favoriteNotes.length > 0) && (
                <FavoritesPanel
                  favoriteFolders={favoriteFolders}
                  favoriteNotes={favoriteNotes}
                  activeFolder={searchResults ? null : activeFolder}
                  selectedNoteId={selectedId}
                  onSelectFolder={(folderId) => {
                    setActiveFolder(folderId);
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  onSelectNote={handleFavoriteNoteClick}
                  onUnfavoriteFolder={(id) => handleToggleFolderFavorite(id, false)}
                  onUnfavoriteNote={(id) => handleToggleNoteFavorite(id, false)}
                />
              )}
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
                onMoveFolder={handleMoveFolder}
                onToggleFavorite={handleToggleFolderFavorite}
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
                      <option value="sortOrder">Manual</option>
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
                    onToggleFavorite={handleToggleNoteFavorite}
                    searchResults={searchResults}
                    sortByManual={sortBy === "sortOrder"}
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
                  onToggleFavorite={handleToggleNoteFavorite}
                  sortByManual={sortBy === "sortOrder"}
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
                {trashCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-0.5 rounded-full bg-border text-[10px] text-muted-foreground">
                    {trashCount}
                  </span>
                )}
              </button>
            </div>
          </DndContext>
        ) : (
          <>
            {/* Trash view header */}
            <div className="p-2 pb-4">
              <button
                onClick={() => {
                  setSidebarView("notes");
                  setSelectedTrashIds(new Set());
                  setConfirmBulkDelete(null);
                  setConfirmPermanentDelete(false);
                  setSelectedId(null);
                  setTitle("");
                  setContent("");
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <span>&larr;</span> Back
              </button>
            </div>

            {/* Select-all + bulk actions */}
            {trashNotes.length > 0 && (
              <div className="px-2 pb-1 flex items-center gap-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTrashIds.size === trashNotes.length}
                    onChange={toggleSelectAll}
                    className="mr-1.5 accent-primary cursor-pointer"
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
                    className="text-xs text-destructive hover:text-destructive-hover transition-colors cursor-pointer"
                  >
                    Delete Selected ({selectedTrashIds.size})
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmBulkDelete("all")}
                    className="text-xs text-destructive hover:text-destructive-hover transition-colors cursor-pointer"
                  >
                    Delete All
                  </button>
                )}
              </div>
            )}

            {/* Trash note list */}
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
                      className="ml-2 shrink-0 accent-primary cursor-pointer"
                      aria-label={`Select ${note.title || "Untitled"}`}
                    />
                    <button
                      onClick={() => selectNote(note)}
                      className="flex-1 text-left px-1 py-2 truncate cursor-pointer"
                    >
                      {note.title || "Untitled"}
                    </button>
                  </div>
                ))
              )}
            </nav>

            {/* Retention setting */}
            <div className="px-3 py-2 border-t border-border flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Auto-delete:</span>
              <select
                value={trashRetentionDays}
                onChange={(e) => handleRetentionChange(Number(e.target.value))}
                className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                aria-label="Trash retention period"
              >
                {TRASH_RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
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
        {selectedNote && sidebarView === "trash" ? (
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
                onClick={() => handleRestoreNote(selectedNote.id)}
                className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
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
                    className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmPermanentDelete(false)}
                    className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePermanentDelete}
                  className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
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
        ) : selectedNote ? (
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
                onChange={(e) => setTitle(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === "Untitled") {
                    setTitle("");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.trim() === "") {
                    setTitle("Untitled");
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
                      onChange={(val: string) => setContent(val)}
                      onSave={handleSave}
                      showLineNumbers={showLineNumbers}
                      wordWrap={editorSettings.wordWrap}
                      tabSize={editorSettings.tabSize}
                      fontSize={editorSettings.editorFontSize}
                      theme={resolvedTheme}
                      accentColor={accentHex}
                      extensions={[wikiLinkExt]}
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
                {selectedId && sidebarView !== "trash" && (
                  <BacklinksPanel noteId={selectedId} onNavigate={handleWikiLinkClick} />
                )}
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground">
              Select a note or create a new one
            </p>
          </div>
        )}
      </div>

      {/* Sliding drawer with tabbed content */}
      <div
        className="fixed top-0 right-0 h-full z-10 overflow-visible transition-transform duration-300 ease-in-out"
        style={{
          width: drawerResize.size,
          transform: drawerOpen ? "translateX(0)" : `translateX(${drawerResize.size}px)`,
        }}
      >
        {/* Tab buttons on left edge, above backlinks panel */}
        {selectedId && sidebarView !== "trash" && (
          <div className="absolute right-full flex flex-col gap-1" style={{ bottom: 38 }}>
            <button
              onClick={() => handleDrawerTabClick("history")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors cursor-pointer ${
                drawerOpen && drawerTab === "history"
                  ? "bg-primary text-primary-contrast"
                  : "bg-card text-muted-foreground border border-r-0 border-border hover:text-foreground hover:bg-muted"
              }`}
              title="Version History"
              aria-label="Version History"
              data-testid="drawer-tab-history"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
          </div>
        )}
        <div className="h-full flex bg-card shadow-lg">
          <ResizeDivider
            direction="vertical"
            isDragging={drawerResize.isDragging}
            onPointerDown={drawerResize.onPointerDown}
          />
          <div className="flex-1 min-w-0 h-full">
            {drawerTab === "history" && selectedId ? (
              <VersionHistoryPanel
                noteId={selectedId}
                onSelectVersion={setSelectedVersion}
                selectedVersionId={selectedVersion?.id}
                refreshKey={versionRefreshKey}
              />
            ) : null}
          </div>
        </div>
      </div>
      </main>

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
            className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Success toast */}
      {successToast && (
        <div className="fixed bottom-4 right-4 bg-card border border-primary rounded-md px-4 py-3 shadow-lg flex items-center gap-3">
          <span className="text-sm text-foreground">{successToast}</span>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
