import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "../context/AuthContext.tsx";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import type {
  Note,
  NoteSearchResult,
  FolderInfo,
  TagInfo,
  NoteSortField,
  SortOrder,
  NoteTitleEntry,
  NoteVersion,
  SyncRejection,
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
  reorderFavoriteNotes,
  toggleFolderFavorite,
  upsertNoteFromRemote,
  linkNoteToLocalFile,
  unlinkLocalFile,
  updateLocalFileHash,
  fetchLocalFileNotes,
  findNoteByLocalPath,
  getNoteLocalPath,
  enqueueSyncAction,
  type SearchMode,
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
import { TabBar, type Tab } from "../components/TabBar.tsx";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import { FolderTree, flattenFolderTree, getFolderBreadcrumb } from "../components/FolderTree.tsx";
import { TagBrowser } from "../components/TagBrowser.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.tsx";
import { DiffView } from "../components/DiffView.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";
import { useAiSettings, type CompletionStyle } from "../hooks/useAiSettings.ts";
import { ghostTextExtension, continueWritingKeymap } from "../editor/ghostText.ts";
import { fetchCompletion, summarizeNote, suggestTags as suggestTagsApi, rewriteText } from "../api/ai.ts";
import { rewriteExtension } from "../editor/rewriteMenu.ts";
import { wikiLinkAutocomplete } from "../editor/wikiLinkComplete.ts";
import { SyncStatusButton } from "../components/SyncStatusButton.tsx";
import { SyncIssuesDialog } from "../components/SyncIssuesDialog.tsx";
import {
  initSyncEngine,
  destroySyncEngine,
  notifyLocalChange,
  manualSync,
  setSyncSemanticSearchEnabled,
  type SyncStatus,
} from "../lib/syncEngine.ts";
import {
  processAllPendingEmbeddings,
  stopEmbeddingProcessor,
  setEmbeddingStatusCallback,
  queueEmbeddingForNote,
  type EmbeddingStatus,
} from "../lib/embeddingService.ts";
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
import { ImportButton } from "../components/ImportButton.tsx";
import { ImportChoiceDialog } from "../components/ImportChoiceDialog.tsx";
import { LocalFileDeleteDialog } from "../components/LocalFileDeleteDialog.tsx";
import { ExternalChangeDialog } from "../components/ExternalChangeDialog.tsx";
import { LocalFileDiffView } from "../components/LocalFileDiffView.tsx";
import {
  readLocalFile,
  writeLocalFile,
  computeContentHash,
  fileExists,
  getFileStat,
  validateFileSize,
  deleteLocalFile,
  pickSaveLocation,
  collectFilePaths,
  isDirectory,
  startWatching,
  stopWatching,
  stopAllWatchers,
  reestablishWatchers,
  startPollTimer,
  stopPollTimer,
  type LocalFileStatus,
} from "../lib/localFileService.ts";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage.tsx";
import { ChangePasswordPage } from "./ChangePasswordPage.tsx";
import { AdminPage } from "./AdminPage.tsx";
import { AudioRecorder } from "../components/AudioRecorder.tsx";
import { QAPanel } from "../components/QAPanel.tsx";
import { TocPanel } from "../components/TocPanel.tsx";
import { Dashboard } from "../components/Dashboard.tsx";

type SaveStatus = "idle" | "saving" | "saved";
type SidebarView = "notes" | "trash";
type DrawerTab = "assistant" | "history" | "toc";

const TRASH_RETENTION_KEY = "ns-desktop:trashRetentionDays";

const validSortFields: NoteSortField[] = ["sortOrder", "updatedAt", "createdAt", "title"];
const validSortOrders: SortOrder[] = ["asc", "desc"];

function validateSortField(value: string | null, fallback: NoteSortField): NoteSortField {
  return value && validSortFields.includes(value as NoteSortField) ? value as NoteSortField : fallback;
}
function validateSortOrder(value: string | null, fallback: SortOrder): SortOrder {
  return value && validSortOrders.includes(value as SortOrder) ? value as SortOrder : fallback;
}

export function NotesPage() {
  const { user, logout } = useAuth();
  const { settings: editorSettings, updateSetting: updateEditorSetting } = useEditorSettings();
  const { settings: aiSettings, updateSetting: updateAiSetting } = useAiSettings();

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [previewTabId, setPreviewTabId] = useState<string | null>(null);
  const tabNoteCacheRef = useRef<Map<string, Note>>(new Map());
  const tabEditorStateRef = useRef<Map<string, { cursor: number; scrollTop: number }>>(new Map());
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveGeneration, setSaveGeneration] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(editorSettings.defaultViewMode);
  const [showLineNumbers, setShowLineNumbers] = useState(editorSettings.showLineNumbers);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<NoteSearchResult[] | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);

  // Folders
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Favorites
  const [favoriteNotes, setFavoriteNotes] = useState<Note[]>([]);
  const [favSortBy, setFavSortBy] = useState<NoteSortField>(() => {
    try {
      return validateSortField(localStorage.getItem("ns-fav-sort-by"), "updatedAt");
    } catch { return "updatedAt"; }
  });
  const [favSortOrder, setFavSortOrder] = useState<SortOrder>(() => {
    try {
      return validateSortOrder(localStorage.getItem("ns-fav-sort-order"), "desc");
    } catch { return "desc"; }
  });

  // Tags
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Sort
  const [sortBy, setSortBy] = useState<NoteSortField>(() => {
    try {
      return validateSortField(localStorage.getItem("ns-desktop-sort-by"), "updatedAt");
    } catch { return "updatedAt"; }
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      return validateSortOrder(localStorage.getItem("ns-desktop-sort-order"), "desc");
    } catch { return "desc"; }
  });

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

  // Settings / Change Password / Admin
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // AI state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [confirmDeleteSummary, setConfirmDeleteSummary] = useState(false);
  const titleRef = useRef(title);
  titleRef.current = title;
  const contentRef = useRef(content);
  contentRef.current = content;

  // Note titles (for wiki-link autocomplete)
  const [noteTitles, setNoteTitles] = useState<NoteTitleEntry[]>([]);
  const noteTitlesRef = useRef<NoteTitleEntry[]>([]);
  noteTitlesRef.current = noteTitles;

  // Drawer + focus mode
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("history");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const focusModeDrawerRef = useRef(false);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [versionRefreshKey, setVersionRefreshKey] = useState(0);
  const [dashboardKey, setDashboardKey] = useState(0);

  // File drag-and-drop import
  const [isDragOver, setIsDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  // Sync engine
  const [syncStatusState, setSyncStatusState] = useState<SyncStatus>("idle");
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null);
  const [syncRejections, setSyncRejections] = useState<SyncRejection[]>([]);
  const [syncRejectionNames, setSyncRejectionNames] = useState<Map<string, string>>(new Map());
  const [showSyncIssuesDialog, setShowSyncIssuesDialog] = useState(false);
  const forcePushRef = useRef<(changeIds: string[]) => Promise<void>>(async () => {});
  const discardRef = useRef<(changeIds: string[]) => Promise<void>>(async () => {});

  // Local file support
  const [localFileStatuses, setLocalFileStatuses] = useState<Map<string, LocalFileStatus>>(new Map());
  const lastProcessedHashRef = useRef<Map<string, string>>(new Map());
  const [importChoiceDialog, setImportChoiceDialog] = useState<{ files: FileList | File[]; paths?: string[]; fileNames: string[]; autoSelect: boolean; folderName?: string } | null>(null);
  const [localFileDeleteDialog, setLocalFileDeleteDialog] = useState<{ noteId: string; noteTitle: string } | null>(null);
  const [externalChangeDialog, setExternalChangeDialog] = useState<{ noteId: string; noteTitle: string; content: string; hash: string } | null>(null);
  const [localFileDiffView, setLocalFileDiffView] = useState<{ noteId: string; noteTitle: string; cloudContent: string; localContent: string } | null>(null);

  // Refs to keep sync engine callbacks current (avoid stale closures)
  const refreshSidebarDataRef = useRef<() => void>(() => {});
  const loadFavoriteNotesRef = useRef<() => void>(() => {});
  const loadNoteTitlesRef = useRef<() => void>(() => {});
  const reloadNotesRef = useRef<() => Promise<void>>(async () => {});
  const closeDeletedNoteTabRef = useRef<(noteId: string) => void>(() => {});

  // Counter to discard stale reloadNotes() results (prevents race where a pre-save
  // fetch completes after save and overwrites the editor with old content)
  const reloadNotesCounterRef = useRef(0);

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
  const searchPanelRef = useRef<HTMLDivElement>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  // Close folder dropdown on outside click
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

  // --- Dashboard ---

  useEffect(() => {
    if (!selectedId) {
      setDashboardKey((k) => k + 1);
    }
  }, [selectedId]);

  async function handleDashboardSelectNote(noteId: string) {
    try {
      const note = await fetchNoteById(noteId);
      if (note) {
        openNoteAsTab(note);
      } else {
        showError("Note not found");
      }
    } catch {
      showError("Failed to open note");
    }
  }

  function handleDashboardStartRecording() {
    const recordBtn = document.querySelector<HTMLButtonElement>('[title^="Record audio"]');
    if (recordBtn) {
      recordBtn.click();
    }
  }

  function handleDashboardImportFile() {
    const importBtn = document.querySelector<HTMLButtonElement>('[title="Import"]');
    if (importBtn) {
      importBtn.click();
    }
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
    minSize: 0,
    maxSize: 2000,
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
    initialSize: 350,
    minSize: 250,
    maxSize: 600,
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

    // Initialize sync engine (use refs to avoid stale closures)
    initSyncEngine({
      onStatusChange: (status, error) => {
        setSyncStatusState(status);
        setSyncErrorState(error);
      },
      onDataChanged: () => {
        refreshSidebarDataRef.current();
        loadFavoriteNotesRef.current();
        loadNoteTitlesRef.current();
      },
      onLocalFileCloudUpdate: (noteId) => {
        setLocalFileStatuses((prev) => {
          const next = new Map(prev);
          next.set(noteId, "cloud_newer");
          return next;
        });
      },
      onNoteRemoteDeleted: (noteId) => {
        closeDeletedNoteTabRef.current(noteId);
      },
      onSyncRejections: async (rejections, forcePush, discard) => {
        // Resolve entity names from local DB
        const names = new Map<string, string>();
        for (const r of rejections) {
          if (r.changeType === "note") {
            try {
              const note = await fetchNoteById(r.changeId);
              if (note) names.set(r.changeId, note.title);
            } catch { /* use ID as fallback */ }
          } else {
            names.set(r.changeId, r.changeId);
          }
        }
        setSyncRejections(rejections);
        setSyncRejectionNames(names);
        forcePushRef.current = forcePush;
        discardRef.current = discard;
      },
    }).catch((err) => console.error("Failed to init sync engine:", err));

    // Initialize local file watchers
    initLocalFileWatchers();

    return () => {
      destroySyncEngine();
      stopAllWatchers();
      stopPollTimer();
    };
  }, []);

  const loadNoteTitles = useCallback(async () => {
    try { setNoteTitles(await listNoteTitles()); } catch {}
  }, []);

  const loadFavoriteNotes = useCallback(async () => {
    try { setFavoriteNotes(await fetchFavoriteNotes({ sortBy: favSortBy, sortOrder: favSortOrder })); } catch {}
  }, [favSortBy, favSortOrder]);

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

  const flatFolders = useMemo(() => flattenFolderTree(folders), [folders]);

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

  // --- Reload favorites when fav sort changes ---

  useEffect(() => {
    if (isLoading) return;
    loadFavoriteNotes();
  }, [loadFavoriteNotes]);

  // --- Reload notes when folder/sort changes ---

  const reloadNotes = useCallback(async () => {
    const requestId = ++reloadNotesCounterRef.current;
    try {
      const result = await fetchNotes({
        folderId: activeFolder === "__unfiled__" ? null : activeFolder === null ? undefined : activeFolder,
        sortBy,
        sortOrder,
      });
      // Only apply if this is still the latest request — prevents a stale fetch
      // (started before a save) from overwriting the notes array with old data
      if (requestId === reloadNotesCounterRef.current) {
        setNotes(result);
      }
    } catch (err) {
      console.error("Failed to reload notes:", err);
    }
  }, [activeFolder, sortBy, sortOrder]);

  useEffect(() => {
    if (isLoading) return;
    reloadNotes();
  }, [reloadNotes]);

  // --- Persist sort preferences ---

  useEffect(() => {
    try { localStorage.setItem("ns-desktop-sort-by", sortBy); } catch {}
  }, [sortBy]);

  useEffect(() => {
    try { localStorage.setItem("ns-desktop-sort-order", sortOrder); } catch {}
  }, [sortOrder]);

  // --- Semantic search lifecycle ---

  const semanticEnabled = aiSettings.masterAiEnabled && aiSettings.semanticSearch;

  useEffect(() => {
    setSyncSemanticSearchEnabled(semanticEnabled);
    if (semanticEnabled) {
      setEmbeddingStatusCallback(setEmbeddingStatus);
      processAllPendingEmbeddings().catch(() => {});
    } else {
      setEmbeddingStatusCallback(null);
      stopEmbeddingProcessor();
      setEmbeddingStatus(null);
    }
    return () => {
      setEmbeddingStatusCallback(null);
      stopEmbeddingProcessor();
    };
  }, [semanticEnabled]);

  // --- Search ---

  const effectiveSearchMode = semanticEnabled ? searchMode : "keyword";

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchNotes(searchQuery, effectiveSearchMode);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults(null);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, effectiveSearchMode]);

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

  const isDirtyValue = useMemo(() => {
    return title !== loadedTitleRef.current || content !== loadedContentRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, saveGeneration]);

  // Auto-pin preview tab when user edits content
  useEffect(() => {
    if (isDirtyValue && previewTabId && selectedId === previewTabId) {
      setPreviewTabId(null);
    }
  }, [isDirtyValue, previewTabId, selectedId]);

  function selectNote(note: Note) {
    // Save outgoing editor state (cursor + scroll)
    if (selectedId) {
      const state = editorRef.current?.getEditorState();
      if (state) {
        tabEditorStateRef.current.set(selectedId, state);
      }
    }

    if (sidebarView !== "trash" && isDirty() && selectedId) {
      // Optimistically update notes array + tab cache so switching back shows saved content
      const savedId = selectedId;
      const savedTitle = title;
      const savedContent = content;
      setNotes((prev) => prev.map((n) => n.id === savedId ? { ...n, title: savedTitle, content: savedContent } : n));
      const cached = tabNoteCacheRef.current.get(savedId);
      if (cached) {
        tabNoteCacheRef.current.set(savedId, { ...cached, title: savedTitle, content: savedContent });
      }
      updateNote(savedId, { title: savedTitle, content: savedContent }).catch((err) =>
        console.error("Failed to save previous note:", err),
      );
    }

    loadedTitleRef.current = note.title;
    loadedContentRef.current = note.content;
    tabNoteCacheRef.current.set(note.id, note);
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSaveStatus("idle");
    setConfirmDelete(false);
    setConfirmPermanentDelete(false);
    setSelectedVersion(null);
    setSuggestedTags([]);
    setConfirmDeleteSummary(false);

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
      tabNoteCacheRef.current.set(updated.id, updated);
      loadedTitleRef.current = title;
      loadedContentRef.current = content;
      setSaveGeneration((g) => g + 1);
      setSaveStatus("saved");

      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);

      // Re-fetch so sort order is respected (e.g. modified-desc moves edited note to top)
      reloadNotes();
      loadFavoriteNotes();

      // Three-write save: also write to local file if linked
      if (updated.isLocalFile) {
        getNoteLocalPath(selectedId).then(async (localPath) => {
          if (!localPath) return;
          try {
            const exists = await fileExists(localPath);
            if (exists) {
              const hash = await writeLocalFile(localPath, content);
              lastProcessedHashRef.current.set(selectedId, hash);
              await updateLocalFileHash(selectedId, hash);
              setLocalFileStatuses((prev) => {
                const next = new Map(prev);
                next.set(selectedId, "synced");
                return next;
              });
            } else {
              setLocalFileStatuses((prev) => {
                const next = new Map(prev);
                next.set(selectedId, "missing");
                return next;
              });
            }
          } catch {
            setLocalFileStatuses((prev) => {
              const next = new Map(prev);
              next.set(selectedId, "missing");
              return next;
            });
          }
        }).catch(() => {});
      }

      // Fire-and-forget: sync wiki-links + refresh titles + capture version
      syncNoteLinks(selectedId, content).catch(() => {});
      captureVersion(selectedId, title, content, editorSettings.versionIntervalMinutes)
        .then(() => setVersionRefreshKey((k) => k + 1))
        .catch(() => {});
      loadNoteTitles();
      notifyLocalChange();

      // Queue embedding if semantic search is enabled
      if (semanticEnabled) {
        queueEmbeddingForNote(selectedId, title, content).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to save note:", err);
      showError("Failed to save note");
      setSaveStatus("idle");
    }
  }, [selectedId, title, content, reloadNotes, loadFavoriteNotes, loadNoteTitles, semanticEnabled]);

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

  // --- Cmd+S to save, Cmd+Shift+D for focus mode, Cmd+W to close tab ---

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        setFocusMode((prev) => {
          if (!prev) {
            focusModeDrawerRef.current = drawerOpen;
            if (drawerOpen) setDrawerOpen(false);
          } else {
            if (focusModeDrawerRef.current) setDrawerOpen(true);
          }
          return !prev;
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (selectedId) {
          closeTab(selectedId);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, drawerOpen, selectedId]);

  // Auto-refresh editor content when notes array updates (e.g. after sync)
  useEffect(() => {
    if (!selectedId || sidebarView === "trash") return;
    const updatedNote = notes.find((n) => n.id === selectedId);
    if (!updatedNote) return;
    const titleChanged = updatedNote.title !== loadedTitleRef.current;
    const contentChanged = updatedNote.content !== loadedContentRef.current;
    if ((titleChanged || contentChanged) && !isDirty()) {
      loadedTitleRef.current = updatedNote.title;
      loadedContentRef.current = updatedNote.content;
      setTitle(updatedNote.title);
      setContent(updatedNote.content);
      tabNoteCacheRef.current.set(updatedNote.id, updatedNote);
    }
  }, [notes, selectedId, sidebarView]);

  // --- Tab handlers ---

  function handleNoteSelect(note: Note) {
    if (openTabs.includes(note.id)) {
      // Note already has a tab — just select
      selectNote(note);
      return;
    }

    // Note is not in any tab — create or replace preview
    if (previewTabId) {
      setOpenTabs((prev) => prev.map((id) => id === previewTabId ? note.id : id));
    } else {
      setOpenTabs((prev) => [...prev, note.id]);
    }
    setPreviewTabId(note.id);
    selectNote(note);
  }

  function openNoteAsTab(note: Note) {
    // Double-clicking the preview note pins it
    if (previewTabId === note.id) {
      setPreviewTabId(null);
      selectNote(note);
      return;
    }

    // Close existing preview tab, add new note as permanent
    const closingPreview = previewTabId;

    setOpenTabs((prev) => {
      let next = closingPreview ? prev.filter((id) => id !== closingPreview) : prev;
      if (!next.includes(note.id)) {
        next = [...next, note.id];
      }
      return next;
    });
    setPreviewTabId(null);
    selectNote(note);
  }

  function pinTab(tabId: string) {
    if (tabId === previewTabId) {
      setPreviewTabId(null);
    }
  }

  function switchTab(noteId: string) {
    const note = notes.find((n) => n.id === noteId) ?? tabNoteCacheRef.current.get(noteId);
    if (note) selectNote(note);
  }

  function closeTab(noteId: string) {
    if (noteId === previewTabId) {
      setPreviewTabId(null);
    }

    // If closing the active tab and it's dirty, fire-and-forget save
    if (noteId === selectedId && isDirty()) {
      // Optimistically update notes array so reopening the note shows saved content
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, title, content } : n));
      updateNote(noteId, { title, content }).catch((err) =>
        console.error("Failed to save changes:", err),
      );
    }

    setOpenTabs((prev) => {
      const idx = prev.indexOf(noteId);
      const next = prev.filter((id) => id !== noteId);

      // If closing the active tab, switch to adjacent
      if (noteId === selectedId) {
        if (next.length === 0) {
          setSelectedId(null);
          setTitle("");
          setContent("");
          loadedTitleRef.current = "";
          loadedContentRef.current = "";
          setConfirmDelete(false);
        } else {
          const newIdx = Math.min(idx, next.length - 1);
          const newActiveId = next[newIdx];
          const newNote = notes.find((n) => n.id === newActiveId) ?? tabNoteCacheRef.current.get(newActiveId);
          if (newNote) selectNote(newNote);
        }
      }

      // Clean up cache for closed tab
      tabNoteCacheRef.current.delete(noteId);
      tabEditorStateRef.current.delete(noteId);

      return next;
    });
  }

  function handleTabDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOpenTabs((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const tabsForDisplay: Tab[] = useMemo(() => {
    return openTabs
      .map((id) => {
        const isPreview = id === previewTabId;
        const note = notes.find((n) => n.id === id) ?? tabNoteCacheRef.current.get(id);
        const isLocalFile = note?.isLocalFile ?? false;
        const localFileStatus = localFileStatuses.get(id);
        if (id === selectedId) {
          return { id, title: title || "Untitled", isDirty: isDirtyValue, isPreview, isLocalFile, localFileStatus };
        }
        if (!note) return null;
        return { id, title: note.title || "Untitled", isDirty: false, isPreview, isLocalFile, localFileStatus };
      })
      .filter((t) => t !== null) as Tab[];
  }, [openTabs, selectedId, title, isDirtyValue, notes, previewTabId, localFileStatuses]);

  // --- CRUD handlers ---

  async function handleCreate() {
    try {
      const folderId =
        activeFolder && activeFolder !== "__unfiled__" ? activeFolder : undefined;
      const note = await createNote({ title: "Untitled", folderId });
      setNotes((prev) => [note, ...prev]);
      openNoteAsTab(note);
      await refreshSidebarData();
      loadNoteTitles();
      notifyLocalChange();
      setTimeout(() => {
        const titleInput = document.querySelector<HTMLInputElement>("[data-title-input]");
        titleInput?.select();
      }, 50);
    } catch (err) {
      console.error("Failed to create note:", err);
      showError(`Failed to create note: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleAudioNoteCreated(serverNote: Note) {
    try {
      await upsertNoteFromRemote(serverNote);
      setNotes((prev) => [serverNote, ...prev]);
      openNoteAsTab(serverNote);
      await refreshSidebarData();
      loadNoteTitles();
      notifyLocalChange();
    } catch (err) {
      console.error("Failed to save audio note:", err);
      showError(`Failed to save audio note: ${err instanceof Error ? err.message : String(err)}`);
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
      if (selectedId === previewTabId) setPreviewTabId(null);
      setOpenTabs((prev) => prev.filter((id) => id !== selectedId));
      tabNoteCacheRef.current.delete(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setFavoriteNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmDelete(false);
      setTrashCount((c) => c + 1);
      await refreshSidebarData();
      loadNoteTitles();
      notifyLocalChange();
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note");
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await softDeleteNote(noteId);
      if (noteId === previewTabId) setPreviewTabId(null);
      setOpenTabs((prev) => prev.filter((id) => id !== noteId));
      tabNoteCacheRef.current.delete(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setFavoriteNotes((prev) => prev.filter((n) => n.id !== noteId));
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
      notifyLocalChange();
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
      notifyLocalChange();
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
      notifyLocalChange();
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
      notifyLocalChange();
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
      notifyLocalChange();
    } catch (err) {
      console.error("Failed to create folder:", err);
      showError("Failed to create folder");
    }
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    try {
      await renameFolder(folderId, newName);
      await refreshFolders();
      notifyLocalChange();
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
      notifyLocalChange();
    } catch {
      showError("Failed to update favorite");
    }
  }

  async function handleToggleFolderFavorite(folderId: string, favorite: boolean) {
    try {
      const updatedFolders = await toggleFolderFavorite(folderId, favorite);
      setFolders(updatedFolders);
      notifyLocalChange();
    } catch {
      showError("Failed to update favorite");
    }
  }

  function handleFavSortByChange(field: NoteSortField) {
    setFavSortBy(field);
    try { localStorage.setItem("ns-fav-sort-by", field); } catch {}
  }

  function handleFavSortOrderChange(order: SortOrder) {
    setFavSortOrder(order);
    try { localStorage.setItem("ns-fav-sort-order", order); } catch {}
  }

  async function handleReorderFavoriteNotes(activeId: string, overId: string) {
    const stripPrefix = (id: string) => id.replace("fav-note:", "");
    const aId = stripPrefix(activeId);
    const oId = stripPrefix(overId);

    const oldIndex = favoriteNotes.findIndex((n) => n.id === aId);
    const newIndex = favoriteNotes.findIndex((n) => n.id === oId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove([...favoriteNotes], oldIndex, newIndex);
    const updated = reordered.map((n, i) => ({ ...n, favoriteSortOrder: i }));
    setFavoriteNotes(updated);

    try {
      await reorderFavoriteNotes(
        updated.map((n) => ({ id: n.id, favoriteSortOrder: n.favoriteSortOrder })),
      );
      notifyLocalChange();
    } catch {
      showError("Failed to reorder favorites");
      loadFavoriteNotes();
    }
  }

  function handleFavoriteNoteClick(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      openNoteAsTab(note);
      return;
    }
    fetchNoteById(noteId)
      .then((fetched) => {
        if (fetched) {
          setNotes((prev) =>
            prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev],
          );
          openNoteAsTab(fetched);
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
      notifyLocalChange();
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

    // Favorite note reorder
    if (activeId.startsWith("fav-note:") && overId.startsWith("fav-note:")) {
      handleReorderFavoriteNotes(activeId, overId);
      return;
    }

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
          notifyLocalChange();
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
        notifyLocalChange();
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
      notifyLocalChange();
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
      notifyLocalChange();
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
      notifyLocalChange();
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

  // Keep sync engine callback refs current
  refreshSidebarDataRef.current = refreshSidebarData;
  loadFavoriteNotesRef.current = loadFavoriteNotes;
  loadNoteTitlesRef.current = loadNoteTitles;
  reloadNotesRef.current = reloadNotes;
  closeDeletedNoteTabRef.current = (noteId: string) => {
    setOpenTabs((prev) => {
      const filtered = prev.filter((id) => id !== noteId);
      if (selectedIdRef.current === noteId) {
        if (filtered.length > 0) {
          const nextId = filtered[filtered.length - 1];
          fetchNoteById(nextId).then((n) => { if (n) selectNote(n); }).catch(() => {});
        } else {
          setSelectedId(null);
          setTitle("");
          setContent("");
          loadedTitleRef.current = "";
          loadedContentRef.current = "";
        }
      }
      return filtered;
    });
  };

  // --- File drag-and-drop import ---

  async function handleImportFiles(files: FileList | File[], autoSelect = false) {
    const entries = parseFileList(files);
    if (entries.length === 0) {
      showError("No supported files found (.md, .txt, .markdown)");
      return;
    }
    // Show choice dialog
    const fileNames = entries.map((e) => e.file.name);
    setImportChoiceDialog({ files, fileNames, autoSelect });
  }

  async function handleImportPaths(paths: string[], autoSelect = false) {
    // Detect if a single directory was dropped — capture its name for folder creation
    let folderName: string | undefined;
    if (paths.length === 1 && await isDirectory(paths[0])) {
      folderName = paths[0].split("/").pop() || undefined;
    }

    const filePaths = await collectFilePaths(paths);
    if (filePaths.length === 0) {
      showError("No supported files found (.md, .txt, .markdown)");
      return;
    }
    const fileNames = filePaths.map((p) => p.split("/").pop() || p);
    // Create File objects from the paths so handleImportToNoteSync can read content
    const files: File[] = [];
    for (const fp of filePaths) {
      try {
        const content = await readLocalFile(fp);
        const name = fp.split("/").pop() || "Untitled";
        const file = new File([content], name, { type: "text/plain" });
        // Attach the real path so handleKeepLocal can use it
        Object.defineProperty(file, "path", { value: fp, writable: false });
        files.push(file);
      } catch {
        // skip unreadable files
      }
    }
    if (files.length === 0) {
      showError("Could not read any of the dropped files");
      return;
    }
    setImportChoiceDialog({ files, paths: filePaths, fileNames, autoSelect, folderName });
  }

  async function handleImportToNoteSync() {
    if (!importChoiceDialog) return;
    const { files, autoSelect, folderName } = importChoiceDialog;
    setImportChoiceDialog(null);
    const entries = parseFileList(files);
    let targetFolderId = activeFolder && activeFolder !== "__unfiled__" ? activeFolder : null;

    // If a folder was dropped, create it and place notes inside
    if (folderName) {
      const folder = await createFolder(folderName, targetFolderId ?? undefined);
      targetFolderId = folder.id;
    }

    let lastCreatedNote: Note | null = null;
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
      createFolder,
      (progress) => setImportProgress(progress),
    );
    setImportProgress(null);
    await refreshSidebarData();
    if (autoSelect && lastCreatedNote && result.successCount > 0) {
      openNoteAsTab(lastCreatedNote);
    }
    notifyLocalChange();
    if (result.failedCount > 0) {
      showError(`Imported ${result.successCount}, failed ${result.failedCount}`);
    } else {
      setSuccessToast(`Imported ${result.successCount} note${result.successCount === 1 ? "" : "s"}`);
      setTimeout(() => setSuccessToast(null), 3000);
    }
  }

  async function handleKeepLocal() {
    if (!importChoiceDialog) return;
    const { files, paths, autoSelect, folderName } = importChoiceDialog;
    setImportChoiceDialog(null);
    let targetFolderId = activeFolder && activeFolder !== "__unfiled__" ? activeFolder : null;

    // If a folder was dropped, create it and place notes inside
    if (folderName) {
      const folder = await createFolder(folderName, targetFolderId ?? undefined);
      targetFolderId = folder.id;
    }

    let successCount = 0;
    let failedCount = 0;
    let lastNote: Note | null = null;

    // Build list of file paths to link — prefer paths from Tauri drag-drop
    const filePaths: string[] = paths ?? [];
    if (filePaths.length === 0) {
      const entries = parseFileList(files);
      for (const entry of entries) {
        const fp = (entry.file as File & { path?: string }).path;
        if (fp) filePaths.push(fp);
      }
    }

    for (const filePath of filePaths) {
      try {
        const fileName = filePath.split("/").pop() || "Untitled";

        // Check for duplicate — re-enqueue sync in case previous push was rejected
        const existing = await findNoteByLocalPath(filePath);
        if (existing) {
          // Re-enqueue the note's folder (if any) and the note itself
          if (existing.folderId) {
            enqueueSyncAction("update", existing.folderId, "folder").catch(() => {});
          }
          enqueueSyncAction("update", existing.id, "note").catch(() => {});
          const note = notes.find((n) => n.id === existing.id);
          if (note) openNoteAsTab(note);
          successCount++;
          continue;
        }

        // Validate size
        const fileStat = await getFileStat(filePath);
        if (fileStat && !validateFileSize(fileStat.size)) {
          showError(`File too large: ${fileName} (max 5MB)`);
          failedCount++;
          continue;
        }

        // Read file content
        const fileContent = await readLocalFile(filePath);
        const hash = await computeContentHash(fileContent);

        // Create note
        const titleFromName = fileName.replace(/\.(md|txt|markdown)$/i, "");
        const note = await createNote({
          title: titleFromName,
          content: fileContent,
          folderId: targetFolderId ?? undefined,
          isLocalFile: true,
        });

        // Link to local file
        await linkNoteToLocalFile(note.id, filePath, hash);
        lastProcessedHashRef.current.set(note.id, hash);

        // Start watching
        await startWatching(note.id, filePath, handleExternalChange, handleFileDeleted);
        setLocalFileStatuses((prev) => {
          const next = new Map(prev);
          next.set(note.id, "synced");
          return next;
        });

        lastNote = note;
        successCount++;
      } catch (err) {
        console.error("Failed to link local file:", err);
        failedCount++;
      }
    }

    await refreshSidebarData();
    if (autoSelect && lastNote) {
      openNoteAsTab(lastNote);
    }
    notifyLocalChange();
    if (failedCount > 0) {
      showError(`Linked ${successCount}, failed ${failedCount}`);
    } else if (successCount > 0) {
      setSuccessToast(`Linked ${successCount} file${successCount === 1 ? "" : "s"}`);
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
    const folderIds = new Set<string>();
    function collectIds(f: FolderInfo) {
      folderIds.add(f.id);
      f.children.forEach(collectIds);
    }
    collectIds(folder);
    try {
      const allNotes = await fetchNotes({});
      const folderNotes = allNotes.filter((n) => n.folderId && folderIds.has(n.folderId));
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

  // Drag-over visual feedback — Tauri handles the actual drop via onDragDropEvent
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
  }

  // --- Local file handlers ---

  async function initLocalFileWatchers() {
    try {
      const localNotes = await fetchLocalFileNotes();
      if (localNotes.length === 0) return;

      const results = await reestablishWatchers(
        localNotes.map((n) => ({ id: n.id, localPath: n.localPath, localFileHash: n.localFileHash })),
        handleExternalChange,
        handleFileDeleted,
      );

      // Seed hash cache so watcher events from unchanged files are ignored
      for (const n of localNotes) {
        if (n.localFileHash) lastProcessedHashRef.current.set(n.id, n.localFileHash);
      }

      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          next.set(r.noteId, r.status);
        }
        return next;
      });

      // Start poll backup
      startPollTimer(
        () => {
          return localNotes
            .filter((n) => localFileStatuses.get(n.id) !== "missing")
            .map((n) => ({ noteId: n.id, path: n.localPath, hash: n.localFileHash }));
        },
        handleExternalChange,
        handleFileDeleted,
      );
    } catch (err) {
      console.error("Failed to init local file watchers:", err);
    }
  }

  function handleExternalChange(noteId: string, newContent: string, newHash: string) {
    // Dedup: ignore if hash matches the last processed hash for this note.
    // This filters out our own writes (suppression window expired) and
    // duplicate watcher events (macOS FSEvents fires multiple times).
    const lastHash = lastProcessedHashRef.current.get(noteId);
    if (lastHash && lastHash === newHash) return;
    lastProcessedHashRef.current.set(noteId, newHash);

    const currentSelectedId = selectedIdRef.current;
    const bufferDirty = titleRef.current !== loadedTitleRef.current || contentRef.current !== loadedContentRef.current;

    if (noteId === currentSelectedId && bufferDirty) {
      // Dirty buffer — show dialog
      setExternalChangeDialog({
        noteId,
        noteTitle: titleRef.current || "Untitled",
        content: newContent,
        hash: newHash,
      });
    } else if (noteId === currentSelectedId) {
      // Clean buffer — silent reload
      setContent(newContent);
      loadedContentRef.current = newContent;
      updateNote(noteId, { content: newContent }).then(() => reloadNotesRef.current()).catch(() => {});
      updateLocalFileHash(noteId, newHash).catch(() => {});
      captureVersion(noteId, titleRef.current, newContent, 0).catch(() => {});
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.set(noteId, "synced");
        return next;
      });
    } else {
      // Non-active tab — update in background and refresh notes list
      updateNote(noteId, { content: newContent }).then(() => reloadNotesRef.current()).catch(() => {});
      updateLocalFileHash(noteId, newHash).catch(() => {});
      fetchNoteById(noteId).then((note) => {
        if (note) captureVersion(noteId, note.title, newContent, 0).catch(() => {});
      }).catch(() => {});
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.set(noteId, "synced");
        return next;
      });
      setSuccessToast("File updated externally");
      setTimeout(() => setSuccessToast(null), 3000);
    }
  }

  function handleFileDeleted(noteId: string) {
    setLocalFileStatuses((prev) => {
      const next = new Map(prev);
      next.set(noteId, "missing");
      return next;
    });
    stopWatching(noteId);
  }

  async function handleSaveAsLocalFile(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    try {
      const defaultName = `${note.title || "untitled"}.md`;
      const savePath = await pickSaveLocation(defaultName);
      if (!savePath) return;

      const hash = await writeLocalFile(savePath, note.content);
      await linkNoteToLocalFile(noteId, savePath, hash);
      await updateNote(noteId, { isLocalFile: true });
      await startWatching(noteId, savePath, handleExternalChange, handleFileDeleted);

      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.set(noteId, "synced");
        return next;
      });
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, isLocalFile: true } : n));
      notifyLocalChange();
      setSuccessToast("Linked to local file");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Failed to save as local file:", err);
      showError("Failed to save as local file");
    }
  }

  async function handleUnlinkLocalFile(noteId: string) {
    try {
      await stopWatching(noteId);
      await unlinkLocalFile(noteId);
      await updateNote(noteId, { isLocalFile: false });
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.delete(noteId);
        return next;
      });
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, isLocalFile: false } : n));
      notifyLocalChange();
      setSuccessToast("Unlinked from local file");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Failed to unlink local file:", err);
      showError("Failed to unlink local file");
    }
  }

  async function handleSaveToFile(noteId: string) {
    try {
      const localPath = await getNoteLocalPath(noteId);
      if (!localPath) return;
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      const hash = await writeLocalFile(localPath, note.content);
      await updateLocalFileHash(noteId, hash);
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.set(noteId, "synced");
        return next;
      });
      setSuccessToast("Saved to local file");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Failed to save to file:", err);
      showError("Failed to save to file");
    }
  }

  async function handleUseLocalVersion(noteId: string) {
    try {
      const localPath = await getNoteLocalPath(noteId);
      if (!localPath) return;
      const fileContent = await readLocalFile(localPath);
      const hash = await computeContentHash(fileContent);
      const updated = await updateNote(noteId, { content: fileContent });
      await updateLocalFileHash(noteId, hash);
      setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
      if (noteId === selectedId) {
        setContent(fileContent);
        loadedContentRef.current = fileContent;
      }
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.set(noteId, "synced");
        return next;
      });
      notifyLocalChange();
    } catch (err) {
      console.error("Failed to use local version:", err);
      showError("Failed to use local version");
    }
  }

  async function handleViewDiff(noteId: string) {
    try {
      const localPath = await getNoteLocalPath(noteId);
      if (!localPath) return;
      // Fetch fresh from DB to avoid stale notes array
      const freshNote = await fetchNoteById(noteId);
      if (!freshNote) return;
      const localContent = await readLocalFile(localPath);
      // If this is the selected note, use the editor content (may have unsaved edits)
      const cloudContent = noteId === selectedIdRef.current ? contentRef.current : freshNote.content;
      setLocalFileDiffView({
        noteId,
        noteTitle: freshNote.title || "Untitled",
        cloudContent,
        localContent,
      });
    } catch (err) {
      console.error("Failed to view diff:", err);
      showError("Failed to read local file for diff");
    }
  }

  async function handleLocalFileDelete(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (note.isLocalFile) {
      setLocalFileDeleteDialog({ noteId, noteTitle: note.title || "Untitled" });
    } else {
      handleDeleteNote(noteId);
    }
  }

  async function handleDeleteFromNoteSync(noteId: string) {
    setLocalFileDeleteDialog(null);
    await stopWatching(noteId);
    setLocalFileStatuses((prev) => {
      const next = new Map(prev);
      next.delete(noteId);
      return next;
    });
    await handleDeleteNote(noteId);
  }

  async function handleDeleteCompletely(noteId: string) {
    setLocalFileDeleteDialog(null);
    try {
      const localPath = await getNoteLocalPath(noteId);
      await stopWatching(noteId);
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.delete(noteId);
        return next;
      });
      await handleDeleteNote(noteId);
      if (localPath) {
        await deleteLocalFile(localPath);
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
      showError("Note deleted but failed to remove local file");
    }
  }

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Tauri native drag-drop — provides full filesystem paths
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    getCurrentWebview().onDragDropEvent((event) => {
      if (cancelled) return;
      if (event.payload.type === "enter") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      } else if (event.payload.type === "drop") {
        setIsDragOver(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          // Check if any paths are images — upload them instead of importing
          const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
          const imagePaths = paths.filter((p: string) => {
            const ext = p.slice(p.lastIndexOf(".")).toLowerCase();
            return imageExts.has(ext);
          });
          const otherPaths = paths.filter((p: string) => !imagePaths.includes(p));

          if (imagePaths.length > 0 && selectedId) {
            // Handle image drops
            (async () => {
              try {
                const { readFile } = await import("@tauri-apps/plugin-fs");
                const { uploadImage } = await import("../api/imageApi.ts");
                for (const imgPath of imagePaths) {
                  const data = await readFile(imgPath);
                  const name = imgPath.split("/").pop() || "image";
                  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
                  const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
                  const file = new File([data.buffer], name, { type: mimeMap[ext] || "image/png" });
                  const result = await uploadImage(selectedId, file);
                  // Insert markdown at end of content
                  const imgName = name.replace(/\.[^.]+$/, "");
                  setContent((prev) => prev + `\n![${imgName}](${result.r2Url})`);
                }
              } catch (err) {
                console.error("Image drop upload failed:", err);
                showError("Failed to upload dropped image");
              }
            })();
          }

          if (otherPaths.length > 0) {
            handleImportPaths(otherPaths, true);
          }
        }
      }
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Open With" / file association — handle files opened via OS
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    // Cold launch: drain any files buffered before listener was ready
    invoke<string[]>("get_opened_files").then((paths) => {
      if (cancelled || paths.length === 0) return;
      handleImportPaths(paths, true);
    });

    // Hot open: listen for files opened while app is running
    listen<string[]>("open-files", (event) => {
      if (cancelled) return;
      // Drain buffer to prevent double-processing on remount
      invoke<string[]>("get_opened_files").catch(() => {});
      if (event.payload.length > 0) {
        handleImportPaths(event.payload, true);
      }
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Filter notes by active tags ---

  const filteredNotes = activeTags.length > 0
    ? notes.filter((n) => activeTags.every((t) => n.tags.includes(t)))
    : notes;

  const selectedNote = (sidebarView === "trash"
    ? trashNotes.find((n) => n.id === selectedId)
    : notes.find((n) => n.id === selectedId) ?? (selectedId ? tabNoteCacheRef.current.get(selectedId) : undefined)) ?? null;

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

  const aiExtensions = useMemo(() => {
    if (!aiSettings.masterAiEnabled) return [];
    return [
      ...(aiSettings.rewrite ? [rewriteExtension(rewriteText)] : []),
      ...(aiSettings.completions
        ? [ghostTextExtension(
            (ctx, sig) => fetchCompletion(ctx, sig, aiSettings.completionStyle),
            aiSettings.completionDebounceMs,
          )]
        : []),
      ...(aiSettings.continueWriting
        ? [continueWritingKeymap((ctx, sig, style) => fetchCompletion(ctx, sig, style as CompletionStyle), () => titleRef.current)]
        : []),
    ];
  }, [aiSettings.masterAiEnabled, aiSettings.rewrite, aiSettings.completions, aiSettings.completionStyle, aiSettings.completionDebounceMs, aiSettings.continueWriting]);

  // Close Q&A panel when setting is disabled
  useEffect(() => {
    if (!aiSettings.qaAssistant) {
      setDrawerOpen(false);
    }
  }, [aiSettings.qaAssistant]);

  function handleTocHeadingClick(slug: string, lineNumber: number) {
    // In preview/split mode, scroll the preview pane to the heading
    const previewContainer = document.querySelector(".markdown-preview");
    if (previewContainer) {
      const heading = previewContainer.querySelector(`#${CSS.escape(slug)}`);
      if (heading) {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        if (viewMode !== "editor") return;
      }
    }
    // In editor mode (or if preview heading not found), scroll the editor
    if (editorRef.current && lineNumber > 0) {
      editorRef.current.scrollToLine(lineNumber);
    }
  }

  function handleDrawerTabClick(tab: DrawerTab) {
    if (drawerOpen && drawerTab === tab) {
      setDrawerOpen(false);
    } else {
      setDrawerTab(tab);
      setDrawerOpen(true);
    }
  }

  function handleQaSelectNote(noteId: string) {
    if (sidebarView === "trash") {
      setSidebarView("notes");
    }
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      openNoteAsTab(note);
    } else {
      reloadNotes().then(() => {
        setOpenTabs((prev) => prev.includes(noteId) ? prev : [...prev, noteId]);
        setSelectedId(noteId);
      });
    }
  }

  async function handleSummarize() {
    if (!selectedId || isSummarizing) return;
    setIsSummarizing(true);
    try {
      if (isDirty()) {
        await handleSave();
      }
      const summary = await summarizeNote(selectedId);
      await updateNote(selectedId, { summary });
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, summary } : n)),
      );
      notifyLocalChange();
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
      notifyLocalChange();
    } catch {
      showError("Failed to delete summary");
    }
  }

  async function handleSuggestTags() {
    if (!selectedId || isSuggestingTags) return;
    setIsSuggestingTags(true);
    try {
      if (isDirty()) {
        await handleSave();
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
      await refreshTags();
      notifyLocalChange();
    } catch {
      showError("Failed to add tag");
    }
  }

  function handleDismissTag(tag: string) {
    setSuggestedTags((prev) => prev.filter((t) => t !== tag));
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
      openNoteAsTab(note);
      return;
    }
    fetchNoteById(noteId)
      .then((fetched) => {
        if (fetched) {
          setNotes((prev) =>
            prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev],
          );
          openNoteAsTab(fetched);
        }
      })
      .catch(() => showError("Linked note not found"));
  }

  function handleRetentionChangeFromSettings(days: number) {
    setTrashRetentionDays(days);
    purgeOldTrash(days)
      .then((purged) => {
        if (purged > 0 && sidebarView === "trash") {
          fetchTrash().then(setTrashNotes).catch(() => {});
        }
      })
      .catch((err) => console.error("Failed to purge trash:", err));
  }

  if (showAdmin) {
    return <AdminPage onBack={() => setShowAdmin(false)} />;
  }

  if (showChangePassword) {
    return <ChangePasswordPage onBack={() => setShowChangePassword(false)} />;
  }

  if (showSettings) {
    return (
      <SettingsPage
        onBack={() => {
          setViewMode(editorSettings.defaultViewMode);
          setShowLineNumbers(editorSettings.showLineNumbers);
          setShowSettings(false);
        }}
        onChangePassword={() => {
          setShowSettings(false);
          setShowChangePassword(true);
        }}
        onTrashRetentionChange={handleRetentionChangeFromSettings}
        editorSettings={editorSettings}
        updateEditorSetting={updateEditorSetting}
        aiSettings={aiSettings}
        updateAiSetting={updateAiSetting}
        embeddingStatus={embeddingStatus}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`bg-sidebar flex flex-col shrink-0 overflow-hidden ${sidebarResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
        style={{ width: focusMode ? 0 : sidebarResize.size }}
      >
        {/* Sidebar header */}
        <div className="pl-4 pr-2 py-4 flex items-center justify-between">
          <h1 className="text-lg font-normal text-foreground">NoteSync</h1>
          {sidebarView === "notes" && (
            <div className="flex items-center gap-1.5">
              {aiSettings.masterAiEnabled && aiSettings.audioNotes && (
                <AudioRecorder
                  defaultMode={aiSettings.audioMode}
                  folderId={activeFolder && activeFolder !== "__unfiled__" ? activeFolder : undefined}
                  recordingSource={aiSettings.recordingSource}
                  onRecordingSourceChange={(src) => updateAiSetting("recordingSource", src)}
                  onNoteCreated={handleAudioNoteCreated}
                  onError={showError}
                />
              )}
              <button
                onClick={handleCreate}
                className="w-7 h-7 flex items-center justify-center rounded bg-primary text-primary-contrast hover:bg-primary-hover transition-colors text-lg leading-none cursor-pointer"
                title="New note"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Search bar + tag browser (hidden in trash view) */}
        {sidebarView === "notes" && (
        <div
          ref={searchPanelRef}
          className="p-2"
          onMouseDown={(e) => {
            // Prevent blur when clicking inside the search panel (tags, show more, etc.)
            if (e.target !== searchInputRef.current) {
              e.preventDefault();
            }
          }}
        >
          <div className="flex items-center rounded-md bg-input border border-border focus-within:ring-1 focus-within:ring-ring">
            {semanticEnabled && (
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                className="appearance-none bg-transparent text-xs text-muted-foreground pl-2 pr-1 py-1.5 focus:outline-none cursor-pointer"
                aria-label="Search mode"
              >
                <option value="hybrid">Hybrid</option>
                <option value="keyword">Keyword</option>
                <option value="semantic">Semantic</option>
              </select>
            )}
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search notes... (⌘K)"
                className={`w-full py-1.5 pr-6 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none ${semanticEnabled ? "pl-1" : "px-3"}`}
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
          </div>
          <div
            className="overflow-y-auto overflow-x-hidden transition-[max-height,opacity] duration-200 ease-in-out"
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
            <div className="shrink-0 overflow-y-auto overflow-x-hidden" style={{ height: folderResize.size }}>
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
                  favSortBy={favSortBy}
                  favSortOrder={favSortOrder}
                  onFavSortByChange={handleFavSortByChange}
                  onFavSortOrderChange={handleFavSortOrderChange}
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
                onExportFolder={handleExportFolder}
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
                <span className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
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
            <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2" data-testid="note-list">
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
                    onSelect={handleNoteSelect}
                    onDoubleClick={openNoteAsTab}
                    onDeleteNote={handleLocalFileDelete}
                    onExportNote={handleExportNote}
                    onToggleFavorite={handleToggleNoteFavorite}
                    searchResults={searchResults}
                    sortByManual={sortBy === "sortOrder"}
                    localFileStatuses={localFileStatuses}
                    onUnlinkLocalFile={handleUnlinkLocalFile}
                    onSaveAsLocalFile={handleSaveAsLocalFile}
                    onSaveToFile={handleSaveToFile}
                    onUseLocalVersion={handleUseLocalVersion}
                    onViewDiff={handleViewDiff}
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
                  onSelect={handleNoteSelect}
                  onDoubleClick={openNoteAsTab}
                  onDeleteNote={handleLocalFileDelete}
                  onExportNote={handleExportNote}
                  onToggleFavorite={handleToggleNoteFavorite}
                  sortByManual={sortBy === "sortOrder"}
                  localFileStatuses={localFileStatuses}
                  onUnlinkLocalFile={handleUnlinkLocalFile}
                  onSaveAsLocalFile={handleSaveAsLocalFile}
                  onSaveToFile={handleSaveToFile}
                  onUseLocalVersion={handleUseLocalVersion}
                  onViewDiff={handleViewDiff}
                />
              )}
            </nav>

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

          </>
        )}

        {/* Sidebar bottom bar */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SyncStatusButton
              status={syncStatusState}
              error={syncErrorState}
              onSync={manualSync}
              hasRejections={syncRejections.length > 0}
              onViewIssues={() => setShowSyncIssuesDialog(true)}
            />
            {sidebarView === "notes" && (
              <>
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
                <ImportButton
                  onImportFiles={(files) => handleImportFiles(files)}
                  onImportDirectory={(files) => handleImportFiles(files)}
                />
              </>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            {user?.role === "admin" && (
              <button
                onClick={() => setShowAdmin(true)}
                className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Admin"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </button>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="Sign out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      <div className="flex" style={{ pointerEvents: focusMode ? "none" : "auto", width: focusMode ? 0 : "auto" }}>
        <ResizeDivider
          direction="vertical"
          isDragging={sidebarResize.isDragging}
          onPointerDown={sidebarResize.onPointerDown}
        />
      </div>

      {/* Editor area */}
      <main
        ref={mainRef}
        className="flex-1 flex min-w-0 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
      {isDragOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <span className="text-lg text-primary font-medium">Drop files to import</span>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        {openTabs.length > 0 && sidebarView === "notes" && (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} modifiers={[restrictToHorizontalAxis]} onDragEnd={handleTabDragEnd}>
            <TabBar
              tabs={tabsForDisplay}
              activeTabId={selectedId}
              onSelectTab={switchTab}
              onCloseTab={closeTab}
              onPinTab={pinTab}
            />
          </DndContext>
        )}
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
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground" title={new Date(selectedNote.createdAt).toLocaleString()}>
                Created {new Date(selectedNote.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground" title={new Date(selectedNote.updatedAt).toLocaleString()}>
                Modified {new Date(selectedNote.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
              <div className="flex-1" />
              {aiSettings.masterAiEnabled && aiSettings.summarize && (
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title={isSummarizing ? "Summarizing..." : "Summarize"}
                  aria-label="Summarize"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>
                </button>
              )}
              {aiSettings.masterAiEnabled && aiSettings.tagSuggestions && (
                <button
                  onClick={handleSuggestTags}
                  disabled={isSuggestingTags}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title={isSuggestingTags ? "Suggesting..." : "Suggest tags"}
                  aria-label="Suggest tags"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                </button>
              )}
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

            {/* Breadcrumb + Title */}
            <div className="relative border-b border-border">
              <div className="absolute left-1.5 bottom-1.5" ref={folderDropdownRef}>
                <button
                  onClick={() => setShowFolderDropdown((v) => !v)}
                  className="w-8 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                            reloadNotes();
                            refreshFolders();
                          } catch {
                            showError("Failed to move note");
                          }
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
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
              <p className="pl-9 pr-4 pb-1.5 -mt-1 text-[10px] text-muted-foreground truncate">
                {selectedNote?.folderId
                  ? getFolderBreadcrumb(folders, selectedNote.folderId).map((f) => f.name).join(" / ")
                  : "Unfiled"}
              </p>
            </div>

            {/* Summary */}
            {selectedNote?.summary && (
              <div className="relative px-4 py-2 text-sm text-muted-foreground border-b border-border italic pr-8 overflow-hidden">
                {selectedNote.summary}
                <button
                  onClick={() => setConfirmDeleteSummary(true)}
                  className="absolute top-1.5 right-2 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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

            {/* Tag input */}
            <TagInput
              tags={selectedNote.tags}
              allTags={tags.map((t) => t.name)}
              onChange={(newTags) => handleUpdateTags(selectedId!, newTags)}
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
                      className="text-primary hover:text-primary-hover transition-colors cursor-pointer"
                      title="Accept tag"
                    >
                      +
                    </button>
                    <button
                      onClick={() => handleDismissTag(tag)}
                      className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {localFileDiffView ? (
              <LocalFileDiffView
                noteTitle={localFileDiffView.noteTitle}
                cloudContent={localFileDiffView.cloudContent}
                localContent={localFileDiffView.localContent}
                onSaveToFile={() => {
                  handleSaveToFile(localFileDiffView.noteId);
                  setLocalFileDiffView(null);
                }}
                onUseLocal={() => {
                  handleUseLocalVersion(localFileDiffView.noteId);
                  setLocalFileDiffView(null);
                }}
                onClose={() => setLocalFileDiffView(null)}
              />
            ) : selectedVersion ? (
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
                      key={selectedId ?? ""}
                      ref={editorRef}
                      value={content}
                      onMount={(view) => {
                        const cached = selectedId ? tabEditorStateRef.current.get(selectedId) : null;
                        if (cached) {
                          const anchor = Math.min(cached.cursor, view.state.doc.length);
                          view.dispatch({ selection: { anchor } });
                          // Defer scroll to after CM's first layout pass — the
                          // scrollDOM has no dimensions during the mount useEffect
                          const scrollTarget = cached.scrollTop;
                          view.requestMeasure({
                            read() {},
                            write() { view.scrollDOM.scrollTop = scrollTarget; },
                          });
                        }
                      }}
                      onChange={(val: string) => setContent(val)}
                      onSave={handleSave}
                      onImageUpload={selectedId ? async (file) => {
                        if (navigator.onLine) {
                          const { uploadImage } = await import("../api/imageApi.ts");
                          const result = await uploadImage(selectedId, file);
                          return result.r2Url;
                        }
                        // Offline: save locally and queue for upload
                        const { v4: uuidv4 } = await import("uuid");
                        const { saveImageLocally } = await import("../lib/imageCacheService.ts");
                        const { createLocalImage, enqueueSyncAction } = await import("../lib/db.ts");
                        const imageId = uuidv4();
                        const buffer = new Uint8Array(await file.arrayBuffer());
                        const localPath = await saveImageLocally(imageId, file.type, buffer);
                        const placeholderUrl = `notesync-local://${imageId}`;
                        await createLocalImage({
                          id: imageId,
                          noteId: selectedId,
                          filename: file.name,
                          mimeType: file.type,
                          sizeBytes: file.size,
                          r2Key: "",
                          r2Url: placeholderUrl,
                          altText: "",
                          syncStatus: "pending_upload",
                        });
                        await enqueueSyncAction("create", imageId, "image", localPath);
                        return placeholderUrl;
                      } : undefined}
                      showLineNumbers={showLineNumbers}
                      wordWrap={editorSettings.wordWrap}
                      tabSize={editorSettings.tabSize}
                      fontSize={editorSettings.editorFontSize}
                      theme={resolvedTheme}
                      accentColor={accentHex}
                      cursorStyle={editorSettings.cursorStyle}
                      cursorBlink={editorSettings.cursorBlink}
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
                      onContentChange={(newContent) => setContent(newContent)}
                    />
                  )}
                </div>
                {selectedId && sidebarView !== "trash" && (
                  <BacklinksPanel noteId={selectedId} onNavigate={handleWikiLinkClick} />
                )}
              </>
            )}
          </>
        ) : sidebarView === "trash" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground">
              Select a note to preview
            </p>
          </div>
        ) : (
          <Dashboard
            key={dashboardKey}
            onSelectNote={handleDashboardSelectNote}
            onCreateNote={handleCreate}
            onStartRecording={handleDashboardStartRecording}
            onImportFile={handleDashboardImportFile}
            audioNotesEnabled={aiSettings.masterAiEnabled && aiSettings.audioNotes}
          />
        )}
      </div>

      {/* Sliding drawer with tabbed content */}
      <div className="relative h-full shrink-0 overflow-visible">
        {/* Tab buttons on left edge, above backlinks panel */}
        {!focusMode && <div className="absolute right-full flex flex-col gap-1" style={{ bottom: 38 }}>
          {/* AI Assistant tab — always visible when setting enabled */}
          {aiSettings.masterAiEnabled && aiSettings.qaAssistant && (
            <button
              onClick={() => handleDrawerTabClick("assistant")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors cursor-pointer ${
                drawerOpen && drawerTab === "assistant"
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
          {/* Version History tab — only when a note is selected */}
          {selectedId && sidebarView !== "trash" && (
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
          )}
          {/* Table of Contents tab */}
          {selectedId && sidebarView !== "trash" && (
            <button
              onClick={() => handleDrawerTabClick("toc")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors cursor-pointer ${
                drawerOpen && drawerTab === "toc"
                  ? "bg-primary text-primary-contrast"
                  : "bg-card text-muted-foreground border border-r-0 border-border hover:text-foreground hover:bg-muted"
              }`}
              title="Table of Contents"
              aria-label="Table of Contents"
              data-testid="drawer-tab-toc"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          )}
        </div>}
        <div
          className={`h-full overflow-hidden ${drawerResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
          style={{ width: drawerOpen ? drawerResize.size : 0 }}
        >
          <div className="h-full flex bg-card shadow-lg" style={{ width: drawerResize.size }}>
            <ResizeDivider
              direction="vertical"
              isDragging={drawerResize.isDragging}
              onPointerDown={drawerResize.onPointerDown}
            />
            <div className="flex-1 min-w-0 h-full">
              {drawerTab === "assistant" && aiSettings.masterAiEnabled && aiSettings.qaAssistant ? (
                <QAPanel onSelectNote={handleQaSelectNote} isOpen={drawerOpen} />
              ) : drawerTab === "history" && selectedId ? (
                <VersionHistoryPanel
                  noteId={selectedId}
                  onSelectVersion={setSelectedVersion}
                  selectedVersionId={selectedVersion?.id}
                  refreshKey={versionRefreshKey}
                />
              ) : drawerTab === "toc" && selectedId ? (
                <TocPanel content={content} onHeadingClick={handleTocHeadingClick} />
              ) : null}
            </div>
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

      {/* Import progress */}
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

      {/* Import choice dialog */}
      {importChoiceDialog && (
        <ImportChoiceDialog
          fileNames={importChoiceDialog.fileNames}
          onImportToNoteSync={handleImportToNoteSync}
          onKeepLocal={handleKeepLocal}
          onCancel={() => setImportChoiceDialog(null)}
        />
      )}

      {/* Local file delete dialog */}
      {localFileDeleteDialog && (
        <LocalFileDeleteDialog
          noteTitle={localFileDeleteDialog.noteTitle}
          onDeleteFromNoteSync={() => handleDeleteFromNoteSync(localFileDeleteDialog.noteId)}
          onDeleteCompletely={() => handleDeleteCompletely(localFileDeleteDialog.noteId)}
          onCancel={() => setLocalFileDeleteDialog(null)}
        />
      )}

      {/* External change dialog */}
      {externalChangeDialog && (
        <ExternalChangeDialog
          noteTitle={externalChangeDialog.noteTitle}
          onReload={() => {
            const { noteId, noteTitle, content: newContent, hash } = externalChangeDialog;
            setExternalChangeDialog(null);
            if (noteId === selectedId) {
              setContent(newContent);
              loadedContentRef.current = newContent;
            }
            updateNote(noteId, { content: newContent }).catch(() => {});
            updateLocalFileHash(noteId, hash).catch(() => {});
            captureVersion(noteId, noteTitle, newContent, 0).catch(() => {});
            setLocalFileStatuses((prev) => {
              const next = new Map(prev);
              next.set(noteId, "synced");
              return next;
            });
          }}
          onKeepMine={() => {
            const { noteId } = externalChangeDialog;
            setExternalChangeDialog(null);
            // Write NoteSync content back to file
            handleSaveToFile(noteId);
          }}
          onViewDiff={() => {
            const { noteId, content: localContent } = externalChangeDialog;
            setExternalChangeDialog(null);
            const note = notes.find((n) => n.id === noteId);
            setLocalFileDiffView({
              noteId,
              noteTitle: note?.title || "Untitled",
              cloudContent: note?.content || "",
              localContent,
            });
          }}
          onCancel={() => setExternalChangeDialog(null)}
        />
      )}
      {showSyncIssuesDialog && syncRejections.length > 0 && (
        <SyncIssuesDialog
          rejections={syncRejections}
          entityNames={syncRejectionNames}
          onForcePush={async (ids) => {
            await forcePushRef.current(ids);
            setSyncRejections((prev) => prev.filter((r) => !ids.includes(r.changeId)));
          }}
          onDiscard={async (ids) => {
            await discardRef.current(ids);
            setSyncRejections((prev) => prev.filter((r) => !ids.includes(r.changeId)));
          }}
          onClose={() => setShowSyncIssuesDialog(false)}
        />
      )}
    </div>
  );
}
