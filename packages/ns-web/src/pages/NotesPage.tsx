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
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import type { Note, NoteVersion, NoteSearchResult, NoteSortField, SortOrder, FolderInfo, TagInfo, NoteTitleEntry } from "@derekentringer/shared/ns";
import { useAuth } from "../context/AuthContext.tsx";
import { useCommands, CommandPalette, QuickSwitcher } from "../commands/index.ts";
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
  fetchNote,
  restoreVersion,
  fetchFavoriteNotes,
  reorderFavoriteNotes as apiReorderFavoriteNotes,
  toggleFolderFavoriteApi,
} from "../api/offlineNotes.ts";
import { useOfflineCache } from "../hooks/useOfflineCache.ts";
import { type SyncStatus } from "../components/SyncStatusButton.tsx";
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
import { TabBar, type Tab } from "../components/TabBar.tsx";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import { TagBrowser, type TagLayout, type TagSort } from "../components/TagBrowser.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useAiSettings, type CompletionStyle, type AudioMode } from "../hooks/useAiSettings.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";
import { ghostTextExtension, continueWritingKeymap } from "../editor/ghostText.ts";
import { rewriteExtension } from "../editor/rewriteMenu.ts";
import { wikiLinkAutocomplete } from "../editor/wikiLinkComplete.ts";
import { fetchCompletion, summarizeNote, suggestTags as suggestTagsApi, rewriteText } from "../api/ai.ts";
import { AudioRecorder, type AudioRecordingState } from "../components/AudioRecorder.tsx";
import { RecordingBar } from "../components/RecordingBar.tsx";
import { QAPanel } from "../components/QAPanel.tsx";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.tsx";
import { TocPanel } from "../components/TocPanel.tsx";
import { DiffView } from "../components/DiffView.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { BacklinksPanel } from "../components/BacklinksPanel.tsx";
import { connectSseStream } from "../api/sse.ts";
import { Dashboard } from "../components/Dashboard.tsx";
import { SidebarTabs, type SidebarPanel } from "../components/SidebarTabs.tsx";
import { stripMarkdown } from "../lib/stripMarkdown.ts";
import { SearchSnippet } from "../components/SearchSnippet.tsx";
import { Ribbon } from "../components/Ribbon.tsx";
import { SyncSwarmGame } from "../components/SyncSwarmGame.tsx";
import { NoteListPanel } from "../components/NoteListPanel.tsx";
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
  const navigate = useNavigate();
  const { noteId: routeNoteId } = useParams<{ noteId?: string }>();
  const { settings, updateSetting: updateAiSetting } = useAiSettings();
  const { settings: editorSettings } = useEditorSettings();
  const { isOnline, lastSyncedAt, pendingCount, isSyncing, reconciledIds } = useOfflineCache();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const [notes, setNotes] = useState<NoteSearchResult[]>([]);
  const [searchResults, setSearchResults] = useState<NoteSearchResult[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("ns-selected-tab") || null;
    } catch { return null; }
  });
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("ns-open-tabs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const [previewTabId, setPreviewTabId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("ns-preview-tab") || null;
    } catch { return null; }
  });
  // Cache note data for open tabs so folder navigation doesn't lose them
  const tabNoteCacheRef = useRef<Map<string, Note>>(new Map());
  const tabEditorStateRef = useRef<Map<string, { cursor: number; scrollTop: number }>>(new Map());
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

  // Track the "loaded" content so we only set isDirty on real user edits
  const loadedContentRef = useRef("");
  const loadedTitleRef = useRef("");

  titleRef.current = title;

  // Note sort state
  const [sortBy, setSortBy] = useState<NoteSortField>(() => {
    try {
      return validateSortField(localStorage.getItem("ns-sort-by"), "updatedAt");
    } catch { return "updatedAt"; }
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      return validateSortOrder(localStorage.getItem("ns-sort-order"), "desc");
    } catch { return "desc"; }
  });

  // Folder state
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [allNotesCount, setAllNotesCount] = useState(0);

  // Tag state
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Favorites state
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

  // Sidebar panel tab state
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(() => {
    try {
      const stored = localStorage.getItem("ns-sidebar-panel");
      if (stored && ["explorer", "search", "favorites", "tags"].includes(stored)) return stored as SidebarPanel;
    } catch {}
    return "explorer";
  });

  // Tag panel state
  const [tagLayout, setTagLayout] = useState<TagLayout>(() => {
    try {
      const stored = localStorage.getItem("ns-tag-layout");
      if (stored === "pills" || stored === "list") return stored;
    } catch {}
    return "list";
  });
  const [tagSort, setTagSort] = useState<TagSort>(() => {
    try {
      const stored = localStorage.getItem("ns-tag-sort");
      if (stored === "count" || stored === "alpha") return stored;
    } catch {}
    return "count";
  });

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

  // Audio recording state
  const [recordingState, setRecordingState] = useState<AudioRecordingState | null>(null);
  const [recordTrigger, setRecordTrigger] = useState<{ mode: AudioMode; key: number } | null>(null);
  const [showGame, setShowGame] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // AI state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);

  const folderResize = useResizable({
    direction: "horizontal",
    initialSize: 160,
    minSize: 0,
    maxSize: 2000,
    storageKey: "ns-folder-height",
  });
  const sidebarResize = useResizable({
    direction: "vertical",
    initialSize: 220,
    minSize: 140,
    maxSize: 400,
    storageKey: "ns-sidebar-width",
  });
  const noteListResize = useResizable({
    direction: "vertical",
    initialSize: 250,
    minSize: 180,
    maxSize: 400,
    storageKey: "ns-notelist-width",
  });
  const splitResize = useResizable({
    direction: "vertical",
    initialSize: 500,
    minSize: 200,
    maxSize: 1200,
    storageKey: "ns-split-width",
  });

  // Drawer state (shared by AI Assistant and Version History)
  type DrawerTab = "assistant" | "history" | "toc";
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("assistant");
  const [qaOpen, setQaOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const focusModeDrawerRef = useRef(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [noteListHidden, setNoteListHidden] = useState(false);

  // Responsive panel collapse
  const [collapseNoteList, setCollapseNoteList] = useState(false);
  const [collapseSidebar, setCollapseSidebar] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const noteListMq = window.matchMedia("(max-width: 900px)");
    const sidebarMq = window.matchMedia("(max-width: 600px)");
    const handleNoteList = (e: MediaQueryListEvent | MediaQueryList) => setCollapseNoteList(e.matches);
    const handleSidebar = (e: MediaQueryListEvent | MediaQueryList) => setCollapseSidebar(e.matches);
    handleNoteList(noteListMq);
    handleSidebar(sidebarMq);
    noteListMq.addEventListener("change", handleNoteList);
    sidebarMq.addEventListener("change", handleSidebar);
    return () => {
      noteListMq.removeEventListener("change", handleNoteList);
      sidebarMq.removeEventListener("change", handleSidebar);
    };
  }, []);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [versionRefreshKey, setVersionRefreshKey] = useState(0);
  const [dashboardKey, setDashboardKey] = useState(0);
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
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // Persist note sort preferences
  useEffect(() => {
    try { localStorage.setItem("ns-sort-by", sortBy); } catch {}
  }, [sortBy]);
  useEffect(() => {
    try { localStorage.setItem("ns-sort-order", sortOrder); } catch {}
  }, [sortOrder]);

  // Persist sidebar panel tab selection
  useEffect(() => {
    try { localStorage.setItem("ns-sidebar-panel", sidebarPanel); } catch {}
  }, [sidebarPanel]);

  // Persist open tabs state
  useEffect(() => {
    try { localStorage.setItem("ns-open-tabs", JSON.stringify(openTabs)); } catch {}
  }, [openTabs]);
  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem("ns-selected-tab", selectedId);
      else localStorage.removeItem("ns-selected-tab");
    } catch {}
  }, [selectedId]);
  useEffect(() => {
    try {
      if (previewTabId) localStorage.setItem("ns-preview-tab", previewTabId);
      else localStorage.removeItem("ns-preview-tab");
    } catch {}
  }, [previewTabId]);

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
    async () => {
      const requestId = ++loadNotesCounterRef.current;
      try {
        const folderIdParam =
          activeFolder && activeFolder !== "__unfiled__"
            ? activeFolder
            : undefined;
        const result = await fetchNotes({
          folderId: folderIdParam,
          tags: activeTags.length > 0 ? activeTags : undefined,
          sortBy,
          sortOrder,
        });
        if (requestId !== loadNotesCounterRef.current) return;
        let filtered = result.notes;
        if (activeFolder === "__unfiled__") {
          filtered = filtered.filter((n) => !n.folderId);
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

  const loadSearchResults = useCallback(
    async (query: string) => {
      if (!query) {
        setSearchResults(null);
        return;
      }
      try {
        const result = await fetchNotes({
          search: query,
          searchMode: settings.semanticSearch ? searchMode : undefined,
          sortBy: "updatedAt",
          sortOrder: "desc",
        });
        setSearchResults(result.notes);
      } catch {
        showError("Failed to search notes");
      }
    },
    [searchMode, settings.semanticSearch],
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
      const result = await fetchFavoriteNotes({ sortBy: favSortBy, sortOrder: favSortOrder });
      setFavoriteNotes(result.notes);
    } catch {
      // Silent fail
    }
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

  // Load notes on mount and when sort/folder/tag changes
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Search results update when debounced search changes
  useEffect(() => {
    loadSearchResults(debouncedSearch);
  }, [debouncedSearch, loadSearchResults]);

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

  // Refs for SSE handler to avoid re-subscribing on every callback change
  const loadNotesRef = useRef(loadNotes);
  const loadFoldersRef = useRef(loadFolders);
  const loadFavoriteNotesRef = useRef(loadFavoriteNotes);
  const loadNoteTitlesRef = useRef(loadNoteTitles);
  const loadTrashRef = useRef(loadTrash);
  const debouncedSearchRef = useRef(debouncedSearch);
  const sidebarViewRef = useRef(sidebarView);
  const closeDeletedNoteTabsRef = useRef<() => void>(() => {});

  // Counter to discard stale loadNotes() results (prevents race where a pre-save
  // fetch completes after save and overwrites the editor with old content)
  const loadNotesCounterRef = useRef(0);

  useEffect(() => { loadNotesRef.current = loadNotes; }, [loadNotes]);
  useEffect(() => { loadFoldersRef.current = loadFolders; }, [loadFolders]);
  useEffect(() => { loadFavoriteNotesRef.current = loadFavoriteNotes; }, [loadFavoriteNotes]);
  useEffect(() => { loadNoteTitlesRef.current = loadNoteTitles; }, [loadNoteTitles]);
  useEffect(() => { loadTrashRef.current = loadTrash; }, [loadTrash]);
  useEffect(() => { debouncedSearchRef.current = debouncedSearch; }, [debouncedSearch]);
  useEffect(() => { sidebarViewRef.current = sidebarView; }, [sidebarView]);

  // Keep tab cleanup ref current — uses functional updaters to avoid stale closures
  closeDeletedNoteTabsRef.current = () => {
    // Read current tabs via functional updater to avoid stale closure
    setOpenTabs((currentTabs) => {
      if (currentTabs.length === 0) return currentTabs;
      // Check every open tab via API — 404 means deleted
      Promise.all(currentTabs.map((id) => fetchNote(id).then(() => null).catch(() => id)))
        .then((results) => {
          const deletedIds = results.filter((id): id is string => id !== null);
          if (deletedIds.length === 0) return;
          const deletedSet = new Set(deletedIds);
          setOpenTabs((prev) => {
            const filtered = prev.filter((id) => !deletedSet.has(id));
            // Handle selected tab being deleted
            setSelectedId((curSelectedId) => {
              if (curSelectedId && deletedSet.has(curSelectedId)) {
                if (filtered.length > 0) {
                  const nextId = filtered[filtered.length - 1];
                  fetchNote(nextId).then((n) => selectNote(n)).catch(() => {});
                } else {
                  setTitle("");
                  setContent("");
                  loadedTitleRef.current = "";
                  loadedContentRef.current = "";
                }
                return filtered.length > 0 ? filtered[filtered.length - 1] : null;
              }
              return curSelectedId;
            });
            return filtered;
          });
        });
      // Return unchanged — actual removal happens in the .then() above
      return currentTabs;
    });
  };

  // Track sync status from online/offline state
  useEffect(() => {
    if (!isOnline) {
      setSyncStatus("offline");
      setSyncError(null);
    }
    // When online: SSE onConnect will set "idle"
  }, [isOnline]);

  // SSE for real-time sync notifications (replaces 30s polling)
  useEffect(() => {
    let sseConn: { disconnect: () => void } | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSyncEvent = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setSyncStatus("syncing");
        const reloads: Promise<unknown>[] = [
          loadNotesRef.current(),
          loadFoldersRef.current(),
          loadFavoriteNotesRef.current(),
          loadNoteTitlesRef.current(),
        ];
        if (sidebarViewRef.current === "trash") {
          reloads.push(loadTrashRef.current());
        }
        Promise.all(reloads)
          .then(() => { setSyncStatus("idle"); setSyncError(null); closeDeletedNoteTabsRef.current(); })
          .catch(() => { setSyncStatus("error"); setSyncError("Sync failed"); });
      }, 500);
    };

    const handleSseError = () => {
      setSyncStatus("error");
      setSyncError("Connection lost");
    };

    const handleSseConnect = () => {
      setSyncStatus("idle");
      setSyncError(null);
    };

    sseConn = connectSseStream(handleSyncEvent, handleSseError, handleSseConnect);

    // Fallback poll at 120s (safety net if SSE drops silently)
    const FALLBACK_POLL_MS = 120_000;
    const fallbackTimer = setInterval(() => {
      loadNotesRef.current();
      loadFoldersRef.current();
      loadFavoriteNotesRef.current();
    }, FALLBACK_POLL_MS);

    return () => {
      sseConn?.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(fallbackTimer);
    };
  }, []);

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
    setOpenTabs((prev) => prev.map((id) => reconciledIds.get(id) ?? id));
    setPreviewTabId((prev) => prev && reconciledIds.has(prev) ? reconciledIds.get(prev)! : prev);
    loadNotes();
  }, [reconciledIds]);

  // Manual sync triggered by SyncStatusButton click
  const handleManualSync = useCallback(async () => {
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      const reloads: Promise<unknown>[] = [
        loadNotes(),
        loadFolders(),
        loadFavoriteNotes(),
        loadNoteTitles(),
      ];
      if (sidebarView === "trash") {
        reloads.push(loadTrash());
      }
      await Promise.all(reloads);
      setSyncStatus("idle");
    } catch {
      setSyncStatus("error");
      setSyncError("Sync failed");
    }
  }, [loadNotes, loadFolders, loadFavoriteNotes, loadNoteTitles, loadTrash, sidebarView]);

  // Deep-link: navigate to note from URL on mount (only on initial load)
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (isLoading || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    if (!routeNoteId) return;

    // Try to find the note in the already-loaded list
    const found = notes.find((n) => n.id === routeNoteId);
    if (found) {
      openNoteAsTab(found);
    } else {
      // Fetch the specific note
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(routeNoteId)
          .then((note) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === note.id)) return prev;
              return [note, ...prev];
            });
            openNoteAsTab(note);
          })
          .catch(() => {
            showError("Note not found");
            navigate("/", { replace: true });
          });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeNoteId, isLoading]);

  // Restore persisted selected tab on mount
  const tabRestoreHandled = useRef(false);
  useEffect(() => {
    if (isLoading || tabRestoreHandled.current) return;
    tabRestoreHandled.current = true;
    if (routeNoteId) return; // deep link handler takes priority
    if (!selectedId || openTabs.length === 0) return;

    const found = notes.find((n) => n.id === selectedId);
    if (found) {
      selectNote(found);
    } else {
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(selectedId)
          .then((note) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === note.id)) return prev;
              return [note, ...prev];
            });
            selectNote(note);
          })
          .catch(() => {
            // Note no longer exists — remove from tabs
            setOpenTabs((prev) => prev.filter((id) => id !== selectedId));
            setSelectedId(null);
          });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const selectedNote =
    sidebarView === "notes"
      ? notes.find((n) => n.id === selectedId) ?? tabNoteCacheRef.current.get(selectedId!) ?? null
      : trashNotes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    document.title = selectedNote ? `${selectedNote.title} — NoteSync` : "NoteSync";
    return () => { document.title = "NoteSync"; };
  }, [selectedNote]);

  // Auto-pin preview tab when user edits content
  useEffect(() => {
    if (isDirty && previewTabId && selectedId === previewTabId) {
      setPreviewTabId(null);
    }
  }, [isDirty, previewTabId, selectedId]);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  function selectNote(note: Note) {
    // Save outgoing editor state (cursor + scroll)
    if (selectedId) {
      const state = editorRef.current?.getEditorState();
      if (state) {
        tabEditorStateRef.current.set(selectedId, state);
      }
    }

    if (isDirty && selectedId) {
      // Optimistically update notes array + tab cache so switching back shows saved content
      const savedId = selectedId;
      const savedTitle = title;
      const savedContent = content;
      setNotes((prev) => prev.map((n) => n.id === savedId ? { ...n, title: savedTitle, content: savedContent } : n));
      setFavoriteNotes((prev) => prev.map((n) => n.id === savedId ? { ...n, title: savedTitle, content: savedContent } : n));
      const cached = tabNoteCacheRef.current.get(savedId);
      if (cached) {
        tabNoteCacheRef.current.set(savedId, { ...cached, title: savedTitle, content: savedContent });
      }
      // Fire-and-forget save of current note before switching
      updateNote(savedId, { title: savedTitle, content: savedContent }).catch(() => {
        showError("Failed to save changes to previous note");
      });
    }

    loadedTitleRef.current = note.title;
    loadedContentRef.current = note.content;
    // Update tab note cache so folder navigation doesn't lose tab data
    tabNoteCacheRef.current.set(note.id, note as Note);
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

  // Single-click from sidebar → preview tab behavior
  function handleNoteSelect(note: NoteSearchResult) {
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

  // Double-click from sidebar → open as permanent tab
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
    if (noteId === selectedId && isDirty) {
      // Optimistically update notes array so reopening the note shows saved content
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, title, content } : n));
      setFavoriteNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, title, content } : n));
      updateNote(noteId, { title, content }).catch(() => {
        showError("Failed to save changes");
      });
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
          setIsDirty(false);
          setConfirmDelete(false);
          navigate("/", { replace: true });
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

  const tabsForDisplay: Tab[] = useMemo(() => {
    return openTabs.map((id) => {
      const isPreview = id === previewTabId;
      if (id === selectedId) {
        return { id, title: title || "Untitled", isDirty, isPreview };
      }
      const note = notes.find((n) => n.id === id) ?? tabNoteCacheRef.current.get(id);
      // Always show the tab — even if the note isn't in the current folder's list
      return { id, title: note?.title || "Untitled", isDirty: false, isPreview };
    });
  }, [openTabs, selectedId, title, isDirty, notes, previewTabId]);

  async function handleCreate() {
    try {
      const folderId =
        activeFolder && activeFolder !== "__unfiled__"
          ? activeFolder
          : undefined;
      const note = await createNote({ title: "Untitled", folderId });
      setNotes((prev) => [note, ...prev]);
      openNoteAsTab(note);
      loadFolders();
      loadNoteTitles();
      // Re-fetch to ensure proper sort order
      loadNotes();
      setDashboardKey((k) => k + 1);
    } catch {
      showError("Failed to create note");
    }
  }

  // Dashboard integration — reset key when returning to empty state
  useEffect(() => {
    if (!selectedId) {
      setDashboardKey((k) => k + 1);
    }
  }, [selectedId]);

  async function handleDashboardSelectNote(noteId: string) {
    try {
      const note = await fetchNote(noteId);
      openNoteAsTab(note);
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
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept*=".md"]');
    if (fileInput) {
      fileInput.click();
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
      tabNoteCacheRef.current.set(updated.id, updated);
      loadedTitleRef.current = title;
      loadedContentRef.current = content;
      setIsDirty(false);
      loadNoteTitles();
      setVersionRefreshKey((k) => k + 1);

      // Re-fetch so sort order is respected (e.g. modified-desc moves edited note to top)
      loadNotes();
      loadFavoriteNotes();
      setDashboardKey((k) => k + 1);
    } catch {
      showError("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [selectedId, isDirty, isSaving, title, content, loadNoteTitles, loadNotes, loadFavoriteNotes]);

  async function handleDelete() {
    if (!selectedId) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      await deleteNote(selectedId);
      if (selectedId === previewTabId) setPreviewTabId(null);
      setOpenTabs((prev) => prev.filter((id) => id !== selectedId));
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setFavoriteNotes((prev) => prev.filter((n) => n.id !== selectedId));
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
      if (noteId === previewTabId) setPreviewTabId(null);
      setOpenTabs((prev) => prev.filter((id) => id !== noteId));
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setFavoriteNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedId === noteId) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        setIsDirty(false);
        setConfirmDelete(false);
      }
      setTrashTotal((prev) => prev + 1);
      loadFolders();
      loadFavoriteNotes();
      setDashboardKey((k) => k + 1);
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
      loadFavoriteNotes();
      setDashboardKey((k) => k + 1);
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
      loadNotes();
    }
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
        loadNotes();
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
      loadNotes();
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
      loadNotes();
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
      loadNotes();
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
      setDashboardKey((k) => k + 1);
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
      loadNotes();
    } catch {
      showError("Failed to delete folder");
    }
  }

  const savedTabSelectionRef = useRef<string | null>(null);

  function switchToTrash() {
    // Remember which tab was active so we can restore on return
    if (openTabs.length > 0 && selectedId && openTabs.includes(selectedId)) {
      savedTabSelectionRef.current = selectedId;
    } else {
      savedTabSelectionRef.current = null;
    }
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
    setConfirmPermanentDelete(false);
    setSelectedTrashIds(new Set());

    // Restore previously active tab
    const restoreId = savedTabSelectionRef.current;
    savedTabSelectionRef.current = null;
    if (restoreId && openTabs.includes(restoreId)) {
      const note = notes.find((n) => n.id === restoreId);
      if (note) {
        selectNote(note);
        return;
      }
    }
    setSelectedId(null);
    setTitle("");
    setContent("");
    setIsDirty(false);
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
    loadNotes();
    loadFolders();
    if (autoSelect && lastCreatedNote && result.successCount > 0) {
      openNoteAsTab(lastCreatedNote);
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
    // If CM6's imageUploadExtension already handled this drop, skip
    const alreadyHandled = e.nativeEvent.defaultPrevented;
    e.preventDefault();
    setIsDragOver(false);
    if (alreadyHandled) return;
    const files = Array.from(e.dataTransfer.files);
    const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const imageFiles = files.filter((f) => imageTypes.has(f.type));
    const nonImageFiles = files.filter((f) => !imageTypes.has(f.type));

    // Upload image files directly
    if (imageFiles.length > 0 && selectedId) {
      (async () => {
        try {
          const { uploadImage } = await import("../api/imageApi.ts");
          for (const file of imageFiles) {
            const result = await uploadImage(selectedId, file);
            const name = file.name.replace(/\.[^.]+$/, "");
            setContent((prev) => prev + `\n![${name}](${result.r2Url})`);
          }
        } catch {
          showError("Failed to upload image");
        }
      })();
    }

    // Import text files
    if (nonImageFiles.length > 0) {
      const dt = new DataTransfer();
      nonImageFiles.forEach((f) => dt.items.add(f));
      handleImportFiles(dt.files, true);
    }
  }

  // Register keyboard shortcuts with the command registry
  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      if (!prev) {
        focusModeDrawerRef.current = qaOpen;
        if (qaOpen) setQaOpen(false);
      } else {
        if (focusModeDrawerRef.current) setQaOpen(true);
      }
      return !prev;
    });
  }, [qaOpen]);

  const focusSearch = useCallback(() => {
    setSidebarPanel("search");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const viewModes: ViewMode[] = ["editor", "split", "live", "preview"];
  const cycleViewMode = useCallback(() => {
    setViewMode((cur) => viewModes[(viewModes.indexOf(cur) + 1) % viewModes.length]);
  }, []);

  const cycleTab = useCallback((direction: -1 | 1) => {
    if (openTabs.length <= 1) return;
    const idx = selectedId ? openTabs.indexOf(selectedId) : 0;
    const next = (idx + direction + openTabs.length) % openTabs.length;
    const note = notes.find((n) => n.id === openTabs[next]);
    if (note) openNoteAsTab(note);
  }, [openTabs, selectedId, notes, openNoteAsTab]);

  useCommands({
    // Core
    "palette:open": () => setPaletteOpen(true),
    "switcher:open": () => setSwitcherOpen(true),

    // Note
    "note:save": () => { handleSave(); },
    "note:new": () => { void handleCreate(); },

    // View & Navigation
    "view:cycle-mode": cycleViewMode,
    "view:focus-mode": toggleFocusMode,
    "nav:settings": () => { navigate("/settings"); },
    "nav:search": focusSearch,

    // Sidebar & Panels
    "sidebar:toggle": () => setSidebarHidden((p) => !p),
    "notelist:toggle": () => setNoteListHidden((p) => !p),
    "sidebar:explorer": () => setSidebarPanel("explorer"),
    "sidebar:search": () => setSidebarPanel("search"),
    "sidebar:favorites": () => setSidebarPanel("favorites"),
    "sidebar:tags": () => setSidebarPanel("tags"),

    // Drawer
    "drawer:assistant": () => handleDrawerTabClick("assistant"),
    "drawer:history": () => handleDrawerTabClick("history"),
    "drawer:toc": () => handleDrawerTabClick("toc"),

    // Tab Navigation
    "tab:prev": () => cycleTab(-1),
    "tab:next": () => cycleTab(1),
  });

  // Autosave: debounce after changes
  useEffect(() => {
    if (!isDirty || !selectedId) return;

    const timer = setTimeout(() => {
      handleSave();
    }, editorSettings.autoSaveDelay);

    return () => clearTimeout(timer);
  }, [isDirty, title, content, selectedId, handleSave, editorSettings.autoSaveDelay]);

  // Auto-refresh editor content when notes array updates (e.g. after sync)
  useEffect(() => {
    if (!selectedId || sidebarView === "trash") return;
    const updatedNote = notes.find((n) => n.id === selectedId);
    if (!updatedNote) return;
    const titleChanged = updatedNote.title !== loadedTitleRef.current;
    const contentChanged = updatedNote.content !== loadedContentRef.current;
    if ((titleChanged || contentChanged) && !isDirty) {
      loadedTitleRef.current = updatedNote.title;
      loadedContentRef.current = updatedNote.content;
      setTitle(updatedNote.title);
      setContent(updatedNote.content);
      tabNoteCacheRef.current.set(updatedNote.id, updatedNote as Note);
    }
  }, [notes, selectedId, sidebarView, isDirty]);

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

  // Quick Switcher note entries with folder names
  const switcherNotes = useMemo(() => {
    const folderMap = new Map(folders.map((f) => [f.id, f.name]));
    return notes.map((n) => ({
      id: n.id,
      title: n.title || "Untitled",
      folderName: n.folderId ? folderMap.get(n.folderId) : undefined,
    }));
  }, [notes, folders]);

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
      setDashboardKey((k) => k + 1);
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
      await apiReorderFavoriteNotes({
        order: updated.map((n) => ({ id: n.id, favoriteSortOrder: n.favoriteSortOrder })),
      });
    } catch {
      showError("Failed to reorder favorites");
      loadFavoriteNotes();
    }
  }

  function resolveFavoriteNote(noteId: string, cb: (note: Note) => void) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      cb(note);
    } else {
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(noteId)
          .then((fetched) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === fetched.id)) return prev;
              return [fetched, ...prev];
            });
            cb(fetched);
          })
          .catch(() => showError("Favorited note not found"));
      });
    }
  }

  function handleFavoriteNoteSelect(noteId: string) {
    resolveFavoriteNote(noteId, (note) => handleNoteSelect(note));
  }

  function handleFavoriteNoteOpen(noteId: string) {
    // If the note already has a tab (preview or permanent), just pin it
    if (openTabs.includes(noteId)) {
      if (previewTabId === noteId) {
        setPreviewTabId(null);
      }
      selectNote(notes.find((n) => n.id === noteId)!);
      return;
    }
    resolveFavoriteNote(noteId, (note) => openNoteAsTab(note));
  }

  function handleWikiLinkClick(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      openNoteAsTab(note);
    } else {
      // Note may not be in the current list, fetch it
      import("../api/offlineNotes.ts").then(({ fetchNote }) => {
        fetchNote(noteId)
          .then((fetched) => {
            setNotes((prev) => {
              if (prev.some((n) => n.id === fetched.id)) return prev;
              return [fetched, ...prev];
            });
            openNoteAsTab(fetched);
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
      setDashboardKey((k) => k + 1);
    } catch {
      showError("Failed to add tag");
    }
  }

  function handleDismissTag(tag: string) {
    setSuggestedTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleAudioNoteCreated(note: Note) {
    setNotes((prev) => [note, ...prev]);
    openNoteAsTab(note);
    loadFolders();
    setDashboardKey((k) => k + 1);
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

  function handleTocHeadingClick(slug: string, lineNumber: number) {
    // In preview/split mode, scroll the preview pane to the heading
    const previewContainer = document.querySelector(".markdown-preview");
    if (previewContainer) {
      const heading = previewContainer.querySelector(`#${CSS.escape(slug)}`);
      if (heading) {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        if (viewMode !== "editor" && viewMode !== "live") return;
      }
    }
    // In editor mode (or if preview heading not found), scroll the editor
    if (editorRef.current && lineNumber > 0) {
      editorRef.current.scrollToLine(lineNumber);
    }
  }

  function handleEditAtLine(lineNumber: number) {
    if (viewMode === "split") {
      // In split mode: scroll editor without switching view
      if (editorRef.current && lineNumber > 0) {
        editorRef.current.scrollToLine(lineNumber);
        editorRef.current.focus();
      }
      return;
    }
    // In preview mode: switch to editor and scroll to the line
    setViewMode("editor");
    requestAnimationFrame(() => {
      if (editorRef.current) {
        if (lineNumber > 0) {
          editorRef.current.scrollToLine(lineNumber);
        }
        editorRef.current.focus();
      }
    });
  }

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
      openNoteAsTab(note);
    } else {
      // Note may not be loaded (different folder/search), so reload and select
      loadNotes().then(() => {
        // After reload, try to find and select
        setOpenTabs((prev) => prev.includes(noteId) ? prev : [...prev, noteId]);
        setSelectedId(noteId);
      });
    }
  }

  return (
    <div className="flex flex-col h-full">
    {/* Recording bar — top of window, animated */}
    <div
      className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out shrink-0"
      style={{
        maxHeight: recordingState && (recordingState.state === "recording" || recordingState.state === "processing") ? "36px" : "0px",
        opacity: recordingState && (recordingState.state === "recording" || recordingState.state === "processing") ? 1 : 0,
      }}
    >
      {recordingState && (
        <RecordingBar
          state={recordingState.state as "recording" | "processing"}
          elapsed={recordingState.elapsed}
          mode={recordingState.mode}
          stream={recordingState.stream}
          onStop={recordingState.onStop}
        />
      )}
    </div>
    <div className="flex flex-1 min-h-0">
      {/* Ribbon — always visible */}
      <Ribbon
        onNewNote={handleCreate}
        showAudio={settings.masterAiEnabled && settings.audioNotes}
        onRecord={(mode) => setRecordTrigger({ mode, key: Date.now() })}
        recorderState={recordingState?.state ?? "idle"}
        syncStatus={syncStatus}
        syncError={syncError}
        onSync={handleManualSync}
        pendingCount={pendingCount}
        onGame={() => setShowGame(true)}
        onTrash={switchToTrash}
        trashCount={trashTotal}
        showTrash={sidebarView === "notes"}
        onImportFiles={(files) => handleImportFiles(files)}
        onImportDirectory={(files) => handleImportFiles(files)}
        showImport={sidebarView === "notes"}
        onSettings={() => navigate("/settings")}
        onAdmin={() => navigate("/admin")}
        showAdmin={user?.role === "admin"}
        onSignOut={logout}
      />

      {/* Sidebar */}
      <aside
        className={`bg-sidebar flex flex-col shrink-0 overflow-hidden ${sidebarResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
        style={{ width: focusMode || collapseSidebar || sidebarHidden ? 0 : collapseNoteList ? Math.max(sidebarResize.size, 280) : sidebarResize.size }}
      >

        {sidebarView === "notes" ? (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {/* Sidebar tabs */}
            <SidebarTabs
              activePanel={sidebarPanel}
              onPanelChange={setSidebarPanel}
              showFavorites={favoriteFolders.length > 0 || favoriteNotes.length > 0}
            />

            {/* Sidebar panel content — switches based on active tab */}
            <div key={sidebarPanel} className={`${collapseNoteList ? "shrink-0 h-1/2" : "flex-1"} flex flex-col min-h-0 animate-fade-in`}>
              {sidebarPanel === "explorer" && (
                <div className="flex-1 overflow-y-auto">
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
              )}

              {sidebarPanel === "search" && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div
                    ref={searchPanelRef}
                    className="px-2 pt-2 shrink-0"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground uppercase tracking-wider">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        Search
                      </span>
                    </div>
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
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search notes... (⌘K)"
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded bg-subtle text-muted-foreground hover:text-foreground transition-colors text-xs cursor-pointer"
                          aria-label="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Search results */}
                  {debouncedSearch && (
                    <nav className="flex-1 overflow-y-auto px-2 pb-2 animate-fade-in">
                      {searchResults === null ? (
                        <div className="px-1 py-2 text-xs text-muted-foreground">Searching...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="px-1 py-2 text-xs text-muted-foreground">No results found</div>
                      ) : (
                        <div className="flex flex-col">
                          <div className="px-1 py-1 text-[10px] text-muted-foreground">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</div>
                          {searchResults.map((note) => {
                            const snippet = note.headline ? null : (note.content ? stripMarkdown(note.content, 80) : null);
                            const date = new Date(note.updatedAt);
                            const now = new Date();
                            const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
                            const relDate = diffMin < 1 ? "just now" : diffMin < 60 ? `${diffMin}m ago` : Math.floor(diffMin / 60) < 24 ? `${Math.floor(diffMin / 60)}h ago` : Math.floor(diffMin / 60 / 24) < 7 ? `${Math.floor(diffMin / 60 / 24)}d ago` : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                            return (
                              <button
                                key={note.id}
                                onClick={() => handleNoteSelect(note)}
                                onDoubleClick={(e) => { e.preventDefault(); openNoteAsTab(note); }}
                                className={`w-full text-left px-2 py-1.5 rounded overflow-hidden transition-colors cursor-pointer mb-px ${
                                  selectedId === note.id
                                    ? "bg-accent text-foreground"
                                    : "text-muted hover:bg-accent hover:text-foreground"
                                }`}
                              >
                                <span className="flex items-center gap-1 overflow-hidden">
                                  {note.favorite && <span className="text-[10px] text-primary shrink-0">★</span>}
                                  <span className="text-sm font-medium truncate">{note.title || "Untitled"}</span>
                                </span>
                                {note.headline ? (
                                  <SearchSnippet headline={note.headline} />
                                ) : snippet ? (
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">{snippet}</p>
                                ) : null}
                                <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                                  <span className="text-[10px] text-muted-foreground shrink-0">{relDate}</span>
                                  {note.tags && note.tags.length > 0 && (
                                    <>
                                      <span className="text-[10px] text-muted-foreground">·</span>
                                      {note.tags.slice(0, 2).map((tag) => (
                                        <span key={tag} className="text-[10px] px-1 py-0 rounded bg-primary/15 text-primary/70 truncate max-w-[60px]">{tag}</span>
                                      ))}
                                      {note.tags.length > 2 && (
                                        <span className="text-[10px] text-muted-foreground">+{note.tags.length - 2}</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </nav>
                  )}
                </div>
              )}

              {sidebarPanel === "favorites" && (
                <div className="flex-1 overflow-y-auto">
                  <FavoritesPanel
                    favoriteFolders={favoriteFolders}
                    favoriteNotes={favoriteNotes}
                    activeFolder={activeFolder}
                    selectedNoteId={selectedId}
                    onSelectFolder={setActiveFolder}
                    onSelectNote={handleFavoriteNoteSelect}
                    onDoubleClickNote={handleFavoriteNoteOpen}
                    onUnfavoriteFolder={(id) => handleToggleFolderFavorite(id, false)}
                    onUnfavoriteNote={(id) => handleToggleNoteFavorite(id, false)}
                    favSortBy={favSortBy}
                    favSortOrder={favSortOrder}
                    onFavSortByChange={handleFavSortByChange}
                    onFavSortOrderChange={handleFavSortOrderChange}
                  />
                </div>
              )}

              {sidebarPanel === "tags" && (
                <div className="flex-1 overflow-y-auto px-2 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground uppercase tracking-wider">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                      Tags
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        value={tagSort}
                        onChange={(e) => {
                          const val = e.target.value as TagSort;
                          setTagSort(val);
                          try { localStorage.setItem("ns-tag-sort", val); } catch {}
                        }}
                        className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                        aria-label="Sort tags"
                      >
                        <option value="count">By count</option>
                        <option value="alpha">A-Z</option>
                      </select>
                      <button
                        onClick={() => {
                          const next = tagLayout === "pills" ? "list" : "pills";
                          setTagLayout(next);
                          try { localStorage.setItem("ns-tag-layout", next); } catch {}
                        }}
                        className="flex items-center justify-center w-5 h-5 rounded bg-subtle text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title={tagLayout === "pills" ? "Switch to list view" : "Switch to pill view"}
                        aria-label="Toggle tag layout"
                      >
                        {tagLayout === "pills" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        )}
                      </button>
                      {activeTags.length > 0 && (
                        <button
                          onClick={() => activeTags.forEach((t) => handleToggleTag(t))}
                          className="flex items-center justify-center w-5 h-5 rounded bg-subtle text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Clear tag filter"
                          aria-label="Clear tag filter"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <TagBrowser
                    tags={tags}
                    activeTags={activeTags}
                    onToggleTag={handleToggleTag}
                    onRenameTag={handleRenameTag}
                    onDeleteTag={handleDeleteTag}
                    layout={tagLayout}
                    sortBy={tagSort}
                    showFilter
                  />
                </div>
              )}
            </div>

            {/* Stacked note list — shown inside sidebar when viewport is narrow */}
            {collapseNoteList && !focusMode && (
              <>
                <ResizeDivider
                  direction="horizontal"
                  isDragging={false}
                  onPointerDown={() => {}}
                />
                <div className="flex-1 min-h-0 overflow-hidden">
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <NoteListPanel
                      notes={notes}
                      selectedId={selectedId}
                      isLoading={isLoading}
                      isSearchResults={false}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSortByChange={setSortBy}
                      onSortOrderChange={setSortOrder}
                      onSelect={handleNoteSelect}
                      onDoubleClick={openNoteAsTab}
                      onDeleteNote={handleDeleteNoteById}
                      onExportNote={handleExportNote}
                      onToggleFavorite={handleToggleNoteFavorite}
                      onCreate={handleCreate}
                    />
                  </DndContext>
                </div>
              </>
            )}
          </DndContext>
        ) : (
          <>
            <div className="p-2 pb-4">
              <button
                onClick={switchToNotes}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>&larr;</span> Back
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

      </aside>

      {!focusMode && !collapseSidebar && !sidebarHidden && (
        <div className="flex">
          <ResizeDivider
            direction="vertical"
            isDragging={sidebarResize.isDragging}
            onPointerDown={sidebarResize.onPointerDown}
          />
        </div>
      )}

      {/* Note list panel */}
      {sidebarView === "notes" && (
        <>
          <div
            className={`shrink-0 overflow-hidden ${noteListResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
            style={{ width: focusMode || collapseNoteList || noteListHidden ? 0 : noteListResize.size }}
          >
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <NoteListPanel
                notes={notes}
                selectedId={selectedId}
                isLoading={isLoading}
                isSearchResults={false}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortByChange={setSortBy}
                onSortOrderChange={setSortOrder}
                onSelect={handleNoteSelect}
                onDoubleClick={openNoteAsTab}
                onDeleteNote={handleDeleteNoteById}
                onExportNote={handleExportNote}
                onToggleFavorite={handleToggleNoteFavorite}
                onCreate={handleCreate}
              />
            </DndContext>
          </div>
          {!focusMode && !collapseNoteList && !noteListHidden && (
            <div className="flex">
              <ResizeDivider
                direction="vertical"
                isDragging={noteListResize.isDragging}
                onPointerDown={noteListResize.onPointerDown}
              />
            </div>
          )}
        </>
      )}

      {/* Editor area */}
      <main
        ref={mainRef}
        className="flex-1 flex min-w-0 relative overflow-hidden"
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
        {openTabs.length > 0 && sidebarView === "notes" && !isLoading && (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} modifiers={[restrictToHorizontalAxis]} onDragEnd={handleTabDragEnd}>
            <TabBar
              tabs={tabsForDisplay}
              activeTabId={selectedId}
              onSelectTab={switchTab}
              onCloseTab={closeTab}
              onPinTab={pinTab}
              onCreate={handleCreate}
            />
          </DndContext>
        )}
        {selectedNote && sidebarView === "notes" ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-4 py-1 border-b border-border shrink-0">
              <span className="text-[11px] text-muted-foreground">
                {isSyncing
                  ? "Syncing..."
                  : isSaving
                    ? "Saving..."
                    : isDirty
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
              {settings.masterAiEnabled && settings.summarize && (
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
              {settings.masterAiEnabled && settings.tagSuggestions && (
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
              <button
                onClick={handleCopyLink}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                title={linkCopied ? "Copied!" : "Copy link"}
                aria-label="Copy link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
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
              <div className="absolute left-2 bottom-1.5" ref={folderDropdownRef}>
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
                            loadNotes();
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
                  if (e.target.value !== loadedTitleRef.current) setIsDirty(true);
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
                    className="inline-flex items-center rounded-full bg-accent text-xs text-foreground border border-border overflow-hidden"
                  >
                    <button
                      onClick={() => handleAcceptTag(tag)}
                      className="px-2 py-0.5 hover:bg-primary/20 transition-colors cursor-pointer"
                      title="Add tag"
                    >
                      {tag}
                    </button>
                    <button
                      onClick={() => handleDismissTag(tag)}
                      className="px-1 py-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border-l border-border"
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
              onStrikethrough={() => editorRef.current?.insertStrikethrough()}
              onInlineCode={() => editorRef.current?.insertInlineCode()}
              onHeading={() => editorRef.current?.cycleHeading()}
              onLink={() => editorRef.current?.insertLink()}
              onImage={() => editorRef.current?.insertImage()}
              onWikiLink={() => editorRef.current?.insertWikiLink()}
              onBulletList={() => editorRef.current?.insertBulletList()}
              onNumberedList={() => editorRef.current?.insertNumberedList()}
              onCheckbox={() => editorRef.current?.insertCheckbox()}
              onBlockquote={() => editorRef.current?.insertBlockquote()}
              onCodeBlock={() => editorRef.current?.insertCodeBlock()}
              onTable={() => editorRef.current?.insertTable()}
              showLineNumbers={showLineNumbers}
              onToggleLineNumbers={() => setShowLineNumbers((v) => !v)}
            />

            {/* Local file indicator */}
            {selectedId && notes.find((n) => n.id === selectedId)?.isLocalFile && (
              <div className="px-4 py-1.5 bg-card/50 border-b border-border text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                This note is linked to a local file on a desktop device
              </div>
            )}

            {/* Content */}
            <div key={selectedId} className="flex-1 flex min-h-0 animate-fade-in">
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
                  onChange={(val) => {
                    setContent(val);
                    if (val !== loadedContentRef.current) setIsDirty(true);
                  }}
                  onSave={handleSave}
                  onImageUpload={selectedId ? async (file) => {
                    const { uploadImage } = await import("../api/imageApi.ts");
                    const result = await uploadImage(selectedId, file);
                    return result.r2Url;
                  } : undefined}
                  showLineNumbers={viewMode === "live" ? false : showLineNumbers}
                  wordWrap={editorSettings.wordWrap}
                  tabSize={editorSettings.tabSize}
                  fontSize={editorSettings.editorFontSize}
                  theme={resolvedTheme}
                  accentColor={resolvedAccentColor}
                  cursorStyle={editorSettings.cursorStyle}
                  cursorBlink={editorSettings.cursorBlink}
                  enableLivePreview={viewMode === "live"}
                  viewMode={viewMode}
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
              {(viewMode === "split" || viewMode === "preview") && (
                <MarkdownPreview
                  content={content}
                  className={viewMode === "split" ? "flex-1 min-w-0 overflow-auto" : "flex-1"}
                  wikiLinkTitleMap={wikiLinkTitleMap}
                  onWikiLinkClick={handleWikiLinkClick}
                  onContentChange={(newContent) => {
                    setContent(newContent);
                    if (newContent !== loadedContentRef.current) setIsDirty(true);
                  }}
                  onEditAtLine={handleEditAtLine}
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
          </div>
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
        ) : sidebarView === "trash" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground">
              Select a note to preview
            </p>
          </div>
        ) : (
          <div className="flex-1 animate-fade-in">
            <Dashboard
              refreshKey={dashboardKey}
              onSelectNote={handleDashboardSelectNote}
              onCreateNote={handleCreate}
              onStartRecording={handleDashboardStartRecording}
              onImportFile={handleDashboardImportFile}
              audioNotesEnabled={settings.masterAiEnabled && settings.audioNotes}
            />
          </div>
        )}
        </div>

      </main>

      {/* Sliding drawer with tabbed content */}
      <div className="relative h-full shrink-0 overflow-visible">
        {/* Tab buttons on left edge, above backlinks panel */}
        {!focusMode && <div className="absolute right-full flex flex-col gap-1" style={{ bottom: 38 }}>
          {/* AI Assistant tab */}
          {settings.masterAiEnabled && settings.qaAssistant && (
            <button
              onClick={() => handleDrawerTabClick("assistant")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors cursor-pointer ${
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
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors cursor-pointer ${
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
          {/* Table of Contents tab */}
          {selectedId && sidebarView === "notes" && (
            <button
              onClick={() => handleDrawerTabClick("toc")}
              className={`flex items-center justify-center w-8 h-10 rounded-l-md shadow-md transition-colors cursor-pointer ${
                qaOpen && drawerTab === "toc"
                  ? "bg-primary text-primary-contrast"
                  : "bg-card text-muted-foreground border border-r-0 border-border hover:text-foreground hover:bg-muted"
              }`}
              title="Table of Contents"
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
          className={`h-full overflow-hidden ${qaResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
          style={{ width: qaOpen ? qaResize.size : 0 }}
        >
          <div className="h-full flex bg-card shadow-lg" style={{ width: qaResize.size }}>
            <ResizeDivider
              direction="vertical"
              isDragging={qaResize.isDragging}
              onPointerDown={qaResize.onPointerDown}
            />
            <div key={drawerTab} className="flex-1 min-w-0 h-full animate-fade-in">
              {drawerTab === "assistant" && settings.masterAiEnabled && settings.qaAssistant ? (
                <QAPanel onSelectNote={handleQaSelectNote} isOpen={qaOpen} />
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

    {/* SyncSwarm mini game */}
    {showGame && <SyncSwarmGame onExit={() => setShowGame(false)} />}

    {/* Audio Recorder (hidden — triggered by ribbon buttons) */}
    {settings.masterAiEnabled && settings.audioNotes && (
      <AudioRecorder
        headless
        defaultMode={settings.audioMode}
        folderId={activeFolder && activeFolder !== "__unfiled__" ? activeFolder : undefined}
        onNoteCreated={handleAudioNoteCreated}
        onError={showError}
        onRecordingStateChange={setRecordingState}
        onModeChange={(m) => updateAiSetting("audioMode", m)}
        triggerMode={recordTrigger?.mode}
        triggerKey={recordTrigger?.key}
      />
    )}

    {/* Command Palette */}
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

    {/* Quick Switcher */}
    <QuickSwitcher
      open={switcherOpen}
      onClose={() => setSwitcherOpen(false)}
      notes={switcherNotes}
      onSelect={(noteId) => {
        const note = notes.find((n) => n.id === noteId);
        if (note) openNoteAsTab(note);
      }}
    />
    </div>
  );
}
