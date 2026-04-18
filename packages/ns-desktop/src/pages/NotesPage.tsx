import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { apiFetch } from "../api/client.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { useCommands, CommandPalette, QuickSwitcher } from "../commands/index.ts";
import { useMenuState } from "../hooks/useMenuState.ts";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
  countAllNotes,
  createNote,
  updateNote,
  softDeleteNote,
  hardDeleteNote,
  hardDeleteFolder,
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
  migrateFrontmatter,
  listManagedDirectories,
  addManagedDirectory,
  removeManagedDirectory,
  getManagedDirectoryByPath,
  isPathConflicting,
  fetchTrackedFilesInDirectory,
  fetchNotesInManagedDirectory,
  resolveFolderForPath,
  restoreNoteByLocalPath,
  type SearchMode,
} from "../lib/db.ts";
import { AboutDialog } from "../components/AboutDialog.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "../components/MarkdownEditor.tsx";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";
import { BacklinksPanel } from "../components/BacklinksPanel.tsx";
import { TrashPanel } from "../components/TrashPanel.tsx";
import {
  EditorToolbar,
  type ViewMode,
} from "../components/EditorToolbar.tsx";
import { NoteList } from "../components/NoteList.tsx";
import { TabBar, type Tab } from "../components/TabBar.tsx";
import { FavoritesPanel } from "../components/FavoritesPanel.tsx";
import { FolderTree, flattenFolderTree, getFolderBreadcrumb } from "../components/FolderTree.tsx";
import { TagBrowser, type TagLayout, type TagSort } from "../components/TagBrowser.tsx";
import { stripFrontmatter } from "@derekentringer/ns-shared";
import { TagInput } from "../components/TagInput.tsx";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.tsx";
import { DiffView } from "../components/DiffView.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";
import { useAiSettings, type CompletionStyle, type AudioMode } from "../hooks/useAiSettings.ts";
import { ghostTextExtension, continueWritingKeymap } from "../editor/ghostText.ts";
import { fetchCompletion, summarizeNote, suggestTags as suggestTagsApi, rewriteText } from "../api/ai.ts";
import { rewriteExtension } from "../editor/rewriteMenu.ts";
import { wikiLinkAutocomplete } from "../editor/wikiLinkComplete.ts";
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
  startDirectoryWatching,
  stopDirectoryWatching,
  stopAllDirectoryWatchers,
  suppressPath,
  moveToTrash,
  startDirectoryReconcileTimer,
  stopDirectoryReconcileTimer,
  scanDirectory,
  reconcileAllDirectories,
  autoIndexFile,
  pickDirectory,
  type LocalFileStatus,
} from "../lib/localFileService.ts";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage.tsx";
import { ChangePasswordPage } from "./ChangePasswordPage.tsx";
import { AudioRecorder, type AudioRecordingState } from "../components/AudioRecorder.tsx";
import { RecordingBar } from "../components/RecordingBar.tsx";
import { FolderPicker } from "../components/FolderPicker.tsx";
import { SyncSwarmGame } from "../components/SyncSwarmGame.tsx";
import { AIAssistantPanel } from "../components/AIAssistantPanel.tsx";
import { TranscriptViewer } from "../components/TranscriptViewer.tsx";
import { useMeetingContext } from "../hooks/useMeetingContext.ts";
import { TocPanel } from "../components/TocPanel.tsx";
import { Dashboard } from "../components/Dashboard.tsx";
import { SidebarTabs, type SidebarPanel } from "../components/SidebarTabs.tsx";
import { stripMarkdown } from "../lib/stripMarkdown.ts";
import { SearchSnippet } from "../components/SearchSnippet.tsx";
import { Ribbon } from "../components/Ribbon.tsx";
import { NoteListPanel } from "../components/NoteListPanel.tsx";

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
  const [allNotesCount, setAllNotesCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("ns-desktop-selected-tab") || null;
    } catch { return null; }
  });
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("ns-desktop-open-tabs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const [previewTabId, setPreviewTabId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("ns-desktop-preview-tab") || null;
    } catch { return null; }
  });
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
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    setShowTranscript(false);
  }, [selectedId]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<NoteSearchResult[] | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);

  // Folders
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [managedFolderIds, setManagedFolderIds] = useState<Set<string>>(new Set());
  const [locallyHostedNoteIds, setLocallyHostedNoteIds] = useState<Set<string>>(new Set());

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
  const [sidebarView, setSidebarView] = useState<SidebarView>(() => {
    try {
      const stored = localStorage.getItem("ns-sidebar-view");
      if (stored === "trash") return "trash";
    } catch {}
    return "notes";
  });
  useEffect(() => {
    try { localStorage.setItem("ns-sidebar-view", sidebarView); } catch {}
  }, [sidebarView]);
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<"all" | "selected" | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(() => {
    const stored = localStorage.getItem(TRASH_RETENTION_KEY);
    return stored !== null ? Number(stored) : 30;
  });

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

  // Settings / Change Password / About
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<string | undefined>();
  const [settingsInitialAction, setSettingsInitialAction] = useState<"whats-new" | "feedback" | undefined>();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // Audio recording state
  const [recordingState, setRecordingState] = useState<AudioRecordingState | null>(null);
  const [recordTrigger, setRecordTrigger] = useState<{ mode: AudioMode; key: number } | null>(null);
  const [completedAudioNote, setCompletedAudioNote] = useState<{ id: string; title: string; content: string; mode: string } | null>(null);
  const [chatRefreshKey, setChatRefreshKey] = useState(0);
  const [showGame, setShowGame] = useState(false);

  // Recording folder — captures active folder when recording starts, independent of sidebar browsing
  const [recordingFolderId, setRecordingFolderId] = useState<string | null>(null);
  const prevRecordingStateRef = useRef<string | null>(null);
  useEffect(() => {
    const currentState = recordingState?.state ?? null;
    if (currentState === "recording" && prevRecordingStateRef.current !== "recording") {
      setRecordingFolderId(activeFolder && activeFolder !== "__unfiled__" ? activeFolder : null);
    } else if (!currentState || currentState === "idle") {
      setRecordingFolderId(null);
    }
    prevRecordingStateRef.current = currentState;
  }, [recordingState?.state, activeFolder]);

  // Meeting Assistant — surface relevant notes during recording
  const isRecording = recordingState?.state === "recording";
  const meetingContext = useMeetingContext(
    isRecording ?? false,
    recordingState?.liveTranscript ?? "",
  );

  // Capture liveTranscript in a ref so it survives the recording state reset
  const lastLiveTranscriptRef = useRef("");
  useEffect(() => {
    const t = recordingState?.liveTranscript ?? "";
    if (t.length > 0) lastLiveTranscriptRef.current = t;
  }, [recordingState?.liveTranscript]);

  // Capture relevant notes in a ref so they survive the recording state reset
  const lastRelevantNotesRef = useRef<typeof meetingContext.relevantNotes>([]);
  useEffect(() => {
    if (meetingContext.relevantNotes.length > 0) {
      lastRelevantNotesRef.current = meetingContext.relevantNotes;
    }
  }, [meetingContext.relevantNotes]);

  // Capture recording mode in a ref so it survives the recording state reset
  const lastRecordingModeRef = useRef<string>("meeting");
  useEffect(() => {
    if (recordingState?.mode) lastRecordingModeRef.current = recordingState.mode;
  }, [recordingState?.mode]);

  // AI state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [confirmDeleteSummary, setConfirmDeleteSummary] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [showManualSummary, setShowManualSummary] = useState(false);
  const [showManualTags, setShowManualTags] = useState(false);
  const [summaryOverflows, setSummaryOverflows] = useState(false);
  const summaryTextRef = useRef<HTMLParagraphElement>(null);

  // Detect if summary text is truncated (overflows its container)
  useEffect(() => {
    const el = summaryTextRef.current;
    if (!el) { setSummaryOverflows(false); return; }
    function check() {
      if (summaryTextRef.current) {
        setSummaryOverflows(summaryTextRef.current.scrollWidth > summaryTextRef.current.clientWidth);
      }
    }
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedId, notes]);
  const titleRef = useRef(title);
  titleRef.current = title;
  const contentRef = useRef(content);
  contentRef.current = content;

  // Note titles (for wiki-link autocomplete)
  const [noteTitles, setNoteTitles] = useState<NoteTitleEntry[]>([]);
  const noteTitlesRef = useRef<NoteTitleEntry[]>([]);
  noteTitlesRef.current = noteTitles;

  // Drawer + focus mode
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(() => {
    const saved = localStorage.getItem("ns-drawer-tab");
    return (saved === "assistant" || saved === "history" || saved === "toc") ? saved : "history";
  });
  const [drawerOpen, setDrawerOpen] = useState(() => localStorage.getItem("ns-drawer-open") === "true");

  useEffect(() => { localStorage.setItem("ns-drawer-open", String(drawerOpen)); }, [drawerOpen]);
  useEffect(() => { localStorage.setItem("ns-drawer-tab", drawerTab); }, [drawerTab]);

  const drawerMountedRef = useRef(false);
  useEffect(() => { requestAnimationFrame(() => { drawerMountedRef.current = true; }); }, []);

  // Switch away from note-specific tabs when no note is selected
  useEffect(() => {
    if (!selectedId && drawerOpen && (drawerTab === "history" || drawerTab === "toc")) {
      if (aiSettings.masterAiEnabled && aiSettings.qaAssistant) {
        setDrawerTab("assistant");
      } else {
        setDrawerOpen(false);
      }
    }
  }, [selectedId, drawerTab, drawerOpen, aiSettings.masterAiEnabled, aiSettings.qaAssistant]);

  const [focusMode, setFocusMode] = useState(false);
  const focusModeDrawerRef = useRef(false);

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
  const [toastStack, setToastStack] = useState<{ id: number; message: string; undoData?: { noteId: string; filePath: string } }[]>([]);
  const toastIdRef = useRef(0);

  function showToast(message: string, durationMs = 5000, undoData?: { noteId: string; filePath: string }) {
    const id = ++toastIdRef.current;
    setToastStack((prev) => [...prev, { id, message, undoData }]);
    setTimeout(() => {
      setToastStack((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }

  function dismissToast(id: number) {
    setToastStack((prev) => prev.filter((t) => t.id !== id));
  }

  // Keep backward compat: setSuccessToast calls still work
  function setSuccessToast(msg: string | null) {
    if (msg) showToast(msg);
  }
  const [versionRefreshKey, setVersionRefreshKey] = useState(0);
  const [dashboardKey, setDashboardKey] = useState(0);

  // File drag-and-drop import
  const [isDragOver, setIsDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const mainRef = useRef<HTMLElement>(null);

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
  // pendingUndoRef removed — undo data is stored per-toast in toastStack
  const [importChoiceDialog, setImportChoiceDialog] = useState<{ files: FileList | File[]; paths?: string[]; fileNames: string[]; autoSelect: boolean; folderName?: string; dirPath?: string } | null>(null);
  const [localFileDeleteDialog, setLocalFileDeleteDialog] = useState<{ noteId: string; noteTitle: string } | null>(null);
  const [externalChangeDialog, setExternalChangeDialog] = useState<{ noteId: string; noteTitle: string; content: string; hash: string } | null>(null);
  const [localFileDiffView, setLocalFileDiffView] = useState<{ noteId: string; noteTitle: string; cloudContent: string; localContent: string } | null>(null);

  // Refs to keep sync engine callbacks current (avoid stale closures)
  const refreshSidebarDataRef = useRef<() => void>(() => {});
  const loadFavoriteNotesRef = useRef<() => void>(() => {});
  const loadNoteTitlesRef = useRef<() => void>(() => {});
  const refreshTrashCountRef = useRef<() => void>(() => {});
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

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

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
    initialSize: 220,
    minSize: 140,
    maxSize: 400,
    storageKey: "ns-desktop-sidebar-width",
  });
  const noteListResize = useResizable({
    direction: "vertical",
    initialSize: 250,
    minSize: 180,
    maxSize: 400,
    storageKey: "ns-desktop-notelist-width",
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
    if (editorSettings.theme === "teams") return "dark" as const;
    return editorSettings.theme;
  })();

  const accentHex = editorSettings.theme === "teams" ? "#887dff" : resolveAccentColor(editorSettings.accentColor, resolvedTheme);

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
        refreshTrashCountRef.current();
      },
      onLocalFileCloudUpdate: (noteId) => {
        setLocalFileStatuses((prev) => {
          const next = new Map(prev);
          next.set(noteId, "cloud_newer");
          return next;
        });
      },
      onNoteRemoteDeleted: async (noteId) => {
        closeDeletedNoteTabRef.current(noteId);
        // Move local file to OS trash if managed locally
        try {
          const localPath = await getNoteLocalPath(noteId);
          if (localPath && await fileExists(localPath)) {
            suppressPath(localPath, 2000);
            await moveToTrash(localPath);
          }
          // Hard-delete the note so it doesn't get re-indexed
          await hardDeleteNote(noteId).catch(() => {});
        } catch { /* ignore */ }
      },
      onFolderRemoteDeleted: async (folderId, folderName, parentId) => {
        // Move local directory to OS trash and hard-delete the folder
        try {
          const dirs = await listManagedDirectories();
          for (const dir of dirs) {
            if (!dir.rootFolderId) continue;
            // Direct child of managed root
            if (dir.rootFolderId === parentId) {
              const dirPath = `${dir.path}/${folderName}`;
              if (await fileExists(dirPath)) {
                // Check if this directory was just re-created (stale delete)
                // by looking for active child folders with this name
                const allFolders = await fetchFolders();
                const flat = flattenFolderTree(allFolders);
                const activeMatch = flat.find((f) => f.name === folderName);
                if (activeMatch && activeMatch.id !== folderId) {
                  // Stale delete — a newer folder owns this directory
                  return;
                }
                suppressPath(dirPath, 2000);
                await moveToTrash(dirPath);
              }
              await hardDeleteFolder(folderId);
              return;
            }
            // This IS the managed root being deleted
            if (dir.rootFolderId === folderId) {
              if (await fileExists(dir.path)) {
                suppressPath(dir.path, 2000);
                await moveToTrash(dir.path);
              }
              await hardDeleteFolder(folderId);
              return;
            }
          }
        } catch { /* ignore */ }
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
      onChatChanged: () => setChatRefreshKey((k) => k + 1),
    }).catch((err) => console.error("Failed to init sync engine:", err));

    // Initialize local file watchers
    initLocalFileWatchers();

    return () => {
      destroySyncEngine();
      stopAllWatchers();
      stopAllDirectoryWatchers();
      stopDirectoryReconcileTimer();
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
      // One-time migration: inject frontmatter into existing notes
      const migrated = await migrateFrontmatter();
      if (migrated) {
        // Clear tab cache so open tabs reload content with frontmatter
        tabNoteCacheRef.current.clear();
      }
      const [notesResult, foldersResult, tagsResult] = await Promise.all([
        fetchNotes({ sortBy, sortOrder }),
        fetchFolders(),
        fetchTags(),
      ]);
      setNotes(notesResult);
      const totalCount = await countAllNotes();
      setAllNotesCount(totalCount);
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

  // Restore persisted selected tab on mount
  const tabRestoreHandled = useRef(false);
  useEffect(() => {
    if (isLoading || tabRestoreHandled.current) return;
    tabRestoreHandled.current = true;
    if (!selectedId || openTabs.length === 0) return;

    const found = notes.find((n) => n.id === selectedId);
    if (found) {
      selectNote(found);
    } else {
      fetchNoteById(selectedId)
        .then((note) => {
          if (note) {
            setNotes((prev) => {
              if (prev.some((n) => n.id === note.id)) return prev;
              return [note, ...prev];
            });
            selectNote(note);
          }
        })
        .catch(() => {
          setOpenTabs((prev) => prev.filter((id) => id !== selectedId));
          setSelectedId(null);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // --- Reload notes when folder/sort changes ---

  const reloadNotes = useCallback(async () => {
    const requestId = ++reloadNotesCounterRef.current;
    try {
      const [result, totalCount] = await Promise.all([
        fetchNotes({
          folderId: activeFolder === "__unfiled__" ? null : activeFolder === null ? undefined : activeFolder,
          sortBy,
          sortOrder,
        }),
        countAllNotes(),
      ]);
      // Only apply if this is still the latest request — prevents a stale fetch
      // (started before a save) from overwriting the notes array with old data
      if (requestId === reloadNotesCounterRef.current) {
        setNotes(result);
        setAllNotesCount(totalCount);
        // Cache all loaded notes for tab persistence across folder switches
        for (const note of result) {
          tabNoteCacheRef.current.set(note.id, note);
        }
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

  useEffect(() => {
    try { localStorage.setItem("ns-sidebar-panel", sidebarPanel); } catch {}
  }, [sidebarPanel]);

  // Persist open tabs state
  useEffect(() => {
    try { localStorage.setItem("ns-desktop-open-tabs", JSON.stringify(openTabs)); } catch {}
  }, [openTabs]);
  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem("ns-desktop-selected-tab", selectedId);
      else localStorage.removeItem("ns-desktop-selected-tab");
    } catch {}
  }, [selectedId]);
  useEffect(() => {
    try {
      if (previewTabId) localStorage.setItem("ns-desktop-preview-tab", previewTabId);
      else localStorage.removeItem("ns-desktop-preview-tab");
    } catch {}
  }, [previewTabId]);

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

  // Keyboard shortcuts are now handled via the command registry (useCommands below)

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
    setSummaryExpanded(false);
    setEditingSummary(false);
    setShowManualSummary(false);
    setShowManualTags(false);

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
      setDashboardKey((k) => k + 1);

      // Three-write save: also write to local file if linked
      if (updated.isLocalFile) {
        getNoteLocalPath(selectedId).then(async (localPath) => {
          if (!localPath) return;
          try {
            const exists = await fileExists(localPath);
            if (exists) {
              // Check if title changed — rename the file on disk
              const { titleFromFilename, renameLocalFile } = await import("../lib/localFileService.ts");
              const currentFileTitle = titleFromFilename(localPath);
              let activePath = localPath;
              if (title && title !== currentFileTitle && title !== "Untitled") {
                try {
                  activePath = await renameLocalFile(localPath, title);
                  await linkNoteToLocalFile(selectedId, activePath, "");
                } catch {
                  // Rename failed — continue with old path
                  activePath = localPath;
                }
              }
              const hash = await writeLocalFile(activePath, content);
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

  // Auto-open AI Assistant drawer when recording starts
  const prevIsRecordingRef = useRef(false);
  useEffect(() => {
    if (isRecording && !prevIsRecordingRef.current) {
      setDrawerTab("assistant");
      setDrawerOpen(true);
    }
    prevIsRecordingRef.current = isRecording ?? false;
  }, [isRecording]);

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

  // --- Command registry shortcuts ---
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [noteListHidden, setNoteListHidden] = useState(false);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      if (!prev) {
        focusModeDrawerRef.current = drawerOpen;
        if (drawerOpen) setDrawerOpen(false);
      } else {
        if (focusModeDrawerRef.current) setDrawerOpen(true);
      }
      return !prev;
    });
  }, [drawerOpen]);

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

  const handleDrawerToggle = useCallback((tab: "assistant" | "history" | "toc") => {
    if (drawerOpen && drawerTab === tab) {
      setDrawerOpen(false);
    } else {
      setDrawerTab(tab);
      setDrawerOpen(true);
    }
  }, [drawerOpen, drawerTab]);

  useMenuState(selectedId !== null && sidebarView === "notes");

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
    "nav:settings": () => setShowSettings(true),
    "nav:search": focusSearch,

    // Sidebar & Panels
    "sidebar:toggle": () => setSidebarHidden((p) => !p),
    "notelist:toggle": () => setNoteListHidden((p) => !p),
    "sidebar:explorer": () => setSidebarPanel("explorer"),
    "sidebar:search": () => setSidebarPanel("search"),
    "sidebar:favorites": () => setSidebarPanel("favorites"),
    "sidebar:tags": () => setSidebarPanel("tags"),

    // Drawer
    "drawer:assistant": () => handleDrawerToggle("assistant"),
    "drawer:history": () => handleDrawerToggle("history"),
    "drawer:toc": () => handleDrawerToggle("toc"),

    // Tab Navigation
    "tab:close": () => { if (selectedId) closeTab(selectedId); },
    "tab:prev": () => cycleTab(-1),
    "tab:next": () => cycleTab(1),

    // View mode (from native menu)
    "view:set-editor": () => setViewMode("editor"),
    "view:set-split": () => setViewMode("split"),
    "view:set-live": () => setViewMode("live"),
    "view:set-preview": () => setViewMode("preview"),

    // Import (from native menu)
    "import:files": () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ".md,.txt,.markdown";
      input.onchange = () => { if (input.files) handleImportFiles(input.files); };
      input.click();
    },
    "import:folder": () => {
      const input = document.createElement("input");
      input.type = "file";
      input.setAttribute("webkitdirectory", "");
      input.onchange = () => { if (input.files) handleImportFiles(input.files); };
      input.click();
    },

    // Editor formatting (triggered from native menu)
    "editor:bold": () => editorRef.current?.insertBold(),
    "editor:italic": () => editorRef.current?.insertItalic(),
    "editor:strikethrough": () => editorRef.current?.insertStrikethrough(),
    "editor:code": () => editorRef.current?.insertInlineCode(),
    "editor:heading": () => editorRef.current?.cycleHeading(),
    "editor:wiki-link": () => editorRef.current?.insertWikiLink(),
    "editor:toggle-checkbox": () => editorRef.current?.insertCheckbox(),

    // Help
    "nav:shortcuts": () => setShowSettings(true),
    "app:about": () => setShowAbout(true),
  });

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
    return openTabs.map((id) => {
      const isPreview = id === previewTabId;
      const note = notes.find((n) => n.id === id) ?? tabNoteCacheRef.current.get(id);
      const isLocalFile = note?.isLocalFile ?? false;
      const localFileStatus = localFileStatuses.get(id);
      if (id === selectedId) {
        return { id, title: title || "Untitled", isDirty: isDirtyValue, isPreview, isLocalFile, localFileStatus };
      }
      // Always show the tab — even if the note isn't in the current folder's list
      return { id, title: note?.title || "Untitled", isDirty: false, isPreview, isLocalFile, localFileStatus };
    });
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
      setDashboardKey((k) => k + 1);
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

  async function handleAudioNoteCreated(serverNote: Note, capturedTranscript?: string) {
    try {
      let finalNote = serverNote;
      const surfacedNotes = lastRelevantNotesRef.current;
      const liveText = capturedTranscript ?? lastLiveTranscriptRef.current;
      const hasRefs = surfacedNotes.length > 0;
      const hasLiveTranscript = liveText.trim().length > 0;

      if (hasRefs || hasLiveTranscript) {
        const patchData: { content?: string; transcript?: string } = {};

        if (hasRefs) {
          const referencesSection = "\n\n## Related Notes Referenced\n" +
            surfacedNotes.map((n) => `- [[${n.title}]]`).join("\n");
          patchData.content = (serverNote.content || "") + referencesSection;
        }

        if (hasLiveTranscript) {
          patchData.transcript = liveText;
        }

        // PATCH the server note directly (note doesn't exist locally yet)
        try {
          const resp = await apiFetch(`/notes/${serverNote.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchData),
          });
          if (resp.ok) {
            const result = await resp.json();
            finalNote = result.note;
          }
        } catch {
          // Non-fatal — use the note without extras
        }
      }

      // Now insert the final note (with wiki-links) into local SQLite
      await upsertNoteFromRemote(finalNote);
      setNotes((prev) => [finalNote, ...prev]);
      openNoteAsTab(finalNote);
      await refreshSidebarData();
      loadNoteTitles();
      setDashboardKey((k) => k + 1);
      notifyLocalChange();
      setCompletedAudioNote({
        id: finalNote.id,
        title: finalNote.title,
        content: finalNote.content,
        mode: lastRecordingModeRef.current,
      });
      lastLiveTranscriptRef.current = "";
      lastRelevantNotesRef.current = [];
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
      // For locally managed files: move to OS trash + hard-delete
      const selectedNote = notes.find((n) => n.id === selectedId);
      if (selectedNote?.isLocalFile) {
        const localPath = await getNoteLocalPath(selectedId);
        if (localPath && await fileExists(localPath)) {
          suppressPath(localPath, 2000);
          await moveToTrash(localPath);
        }
        enqueueSyncAction("delete", selectedId, "note").catch(() => {});
        await hardDeleteNote(selectedId);
      } else {
        await softDeleteNote(selectedId);
        setTrashCount((c) => c + 1);
      }

      if (selectedId === previewTabId) setPreviewTabId(null);
      setOpenTabs((prev) => prev.filter((id) => id !== selectedId));
      tabNoteCacheRef.current.delete(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setFavoriteNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmDelete(false);
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
      // For locally managed files: move to OS trash + hard-delete
      const note = notes.find((n) => n.id === noteId);
      if (note?.isLocalFile) {
        const localPath = await getNoteLocalPath(noteId);
        if (localPath && await fileExists(localPath)) {
          suppressPath(localPath, 2000);
          await moveToTrash(localPath);
        }
        enqueueSyncAction("delete", noteId, "note").catch(() => {});
        await hardDeleteNote(noteId);
      } else {
        await softDeleteNote(noteId);
        setTrashCount((c) => c + 1);
      }
      if (noteId === previewTabId) setPreviewTabId(null);
      const prevTabs = openTabs;
      const idx = prevTabs.indexOf(noteId);
      const nextTabs = prevTabs.filter((id) => id !== noteId);
      setOpenTabs(nextTabs);
      if (noteId === selectedId) {
        if (nextTabs.length === 0) {
          setSelectedId(null);
          setTitle("");
          setContent("");
          loadedTitleRef.current = "";
          loadedContentRef.current = "";
        } else {
          const newIdx = Math.min(idx, nextTabs.length - 1);
          const newActiveId = nextTabs[newIdx];
          const newNote = notes.find((n) => n.id === newActiveId) ?? tabNoteCacheRef.current.get(newActiveId);
          if (newNote) selectNote(newNote);
        }
      }
      tabNoteCacheRef.current.delete(noteId);
      tabEditorStateRef.current.delete(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setFavoriteNotes((prev) => prev.filter((n) => n.id !== noteId));
      await refreshSidebarData();
      loadNoteTitles();
      loadFavoriteNotes();
      setDashboardKey((k) => k + 1);
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
      setDashboardKey((k) => k + 1);
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

  /**
   * Find the local disk path for a NoteSync folder by looking at notes
   * inside it that have a local_path, then deriving the parent directory.
   */
  async function findLocalDirForFolder(folderId: string): Promise<{ dirPath: string; managedDir: { id: string; path: string; rootFolderId: string | null } } | null> {
    const managedDirs = await listManagedDirectories();

    // Check if this IS a root managed folder
    const rootDir = managedDirs.find((d) => d.rootFolderId === folderId);
    if (rootDir) return { dirPath: rootDir.path, managedDir: rootDir };

    // Check if any notes in this folder have a local_path — derive directory from it
    const folderNotes = notes.filter((n) => n.folderId === folderId && n.isLocalFile);
    if (folderNotes.length > 0) {
      const noteWithPath = folderNotes[0];
      const localPath = await getNoteLocalPath(noteWithPath.id);
      if (localPath) {
        const dirPath = localPath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
        const parentDir = managedDirs.find((d) => dirPath.startsWith(d.path));
        if (parentDir) return { dirPath, managedDir: parentDir };
      }
    }

    // Walk up the folder tree to find a managed root, then build the disk path
    // Build a parent map from the FolderInfo tree
    const parentMap = new Map<string, { name: string; parentId: string | null }>();
    function buildParentMap(items: FolderInfo[], parentId: string | null) {
      for (const f of items) {
        parentMap.set(f.id, { name: f.name, parentId });
        buildParentMap(f.children, f.id);
      }
    }
    buildParentMap(folders, null);

    const pathSegments: string[] = [];
    let currentId: string | null = folderId;
    while (currentId) {
      const entry = parentMap.get(currentId);
      if (!entry) break;
      // Check if this ancestor is a managed root
      const ancestorDir = managedDirs.find((d) => d.rootFolderId === currentId);
      if (ancestorDir) {
        const childPath = pathSegments.reverse().join("/");
        const dirPath = childPath ? `${ancestorDir.path}/${childPath}` : ancestorDir.path;
        return { dirPath, managedDir: ancestorDir };
      }
      pathSegments.push(entry.name);
      currentId = entry.parentId;
    }

    return null;
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    try {
      // If this folder maps to a local directory, rename it on disk
      const localInfo = await findLocalDirForFolder(folderId);
      if (localInfo) {
        try {
          const { rename: fsRename } = await import("@tauri-apps/plugin-fs");
          const parts = localInfo.dirPath.replace(/\\/g, "/").split("/");
          parts[parts.length - 1] = newName.replace(/[/\\:*?"<>|]/g, "_");
          const newPath = parts.join("/");

          // Suppress watcher events for both old and new paths
          suppressPath(localInfo.dirPath, 1000);
          suppressPath(newPath, 1000);

          console.log(`[folder-rename] Renaming ${localInfo.dirPath} → ${newPath}`);
          await fsRename(localInfo.dirPath, newPath);

          // If this is a root managed folder, update the managed directory path
          if (localInfo.managedDir.rootFolderId === folderId) {
            await stopDirectoryWatching(localInfo.dirPath);
            await removeManagedDirectory(localInfo.managedDir.id);
            await addManagedDirectory(newPath, folderId);
            // Restart watcher on new path
            await startDirectoryWatching(newPath, {
              onFileCreated: (path) => handleDirectoryFileEvent(path, newPath),
              onFileModified: (path) => handleDirectoryFileEvent(path, newPath),
              onFileDeleted: (path) => handleDirectoryFileDeleted(path),
              onFileRenamed: (oldP, newP) => handleDirectoryFileRenamed(oldP, newP),
              onDirectoryCreated: () => handleDirectoryCreated(),
              onDirectoryDeleted: () => handleDirectoryDeleted(),
              onDirectoryRenamed: () => handleDirectoryRenamed(),
            });
          }

          // Update local_path for all notes inside this folder
          const folderNotes = notes.filter((n) => n.folderId === folderId && n.isLocalFile);
          for (const note of folderNotes) {
            const oldNotePath = await getNoteLocalPath(note.id);
            if (oldNotePath && oldNotePath.startsWith(localInfo.dirPath)) {
              const newNotePath = newPath + oldNotePath.slice(localInfo.dirPath.length);
              const hash = await computeContentHash(note.content);
              await linkNoteToLocalFile(note.id, newNotePath, hash);
            }
          }
        } catch (err) {
          console.error("Failed to rename directory on disk:", err);
        }
      }

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
      setDashboardKey((k) => k + 1);
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

  async function handleSaveFolderLocally(folderId: string) {
    try {
      // Pick a local directory
      const dirPath = await pickDirectory();
      if (!dirPath) return;

      // Check for conflicts
      const { conflicts, reason } = await isPathConflicting(dirPath);
      if (conflicts) {
        showError(reason || "Directory conflicts with an existing managed directory");
        return;
      }

      // Register as managed directory
      await addManagedDirectory(dirPath, folderId);
      setManagedFolderIds((prev) => new Set([...prev, folderId]));

      // Export notes in this folder as .md files to the local directory
      const folderNotes = notes.filter((n) => n.folderId === folderId);
      let exported = 0;
      for (const note of folderNotes) {
        try {
          const fileName = `${(note.title || "Untitled").replace(/[/\\:*?"<>|]/g, "_")}.md`;
          const filePath = `${dirPath}/${fileName}`;
          const hash = await writeLocalFile(filePath, note.content);
          await linkNoteToLocalFile(note.id, filePath, hash);
          await updateNote(note.id, { isLocalFile: true });
          setLocalFileStatuses((prev) => {
            const next = new Map(prev);
            next.set(note.id, "synced");
            return next;
          });
          exported++;
        } catch (err) {
          console.error(`Failed to export note ${note.title}:`, err);
        }
      }

      // Start directory watcher
      await startDirectoryWatching(dirPath, {
        onFileCreated: (path) => handleDirectoryFileEvent(path, dirPath),
        onFileModified: (path) => handleDirectoryFileEvent(path, dirPath),
        onFileDeleted: (path) => handleDirectoryFileDeleted(path),
        onFileRenamed: (oldPath, newPath) => handleDirectoryFileRenamed(oldPath, newPath),
        onDirectoryCreated: () => handleDirectoryCreated(),
        onDirectoryDeleted: () => handleDirectoryDeleted(),
        onDirectoryRenamed: () => handleDirectoryRenamed(),
      });

      await refreshSidebarData();
      notifyLocalChange();
      if (exported > 0) {
        setSuccessToast(`Exported ${exported} note${exported === 1 ? "" : "s"} to ${dirPath}`);
      }
    } catch (err) {
      console.error("Failed to save folder locally:", err);
      showError("Failed to save folder locally");
    }
  }

  async function handleStopManagingFolderLocally(folderId: string) {
    try {
      const managedDirs = await listManagedDirectories();
      const dir = managedDirs.find((d) => d.rootFolderId === folderId);
      if (!dir) return;

      // Stop watching
      await stopDirectoryWatching(dir.path);

      // Unlink all notes in this directory
      const dirNotes = await fetchNotesInManagedDirectory(dir.path);
      for (const note of dirNotes) {
        await unlinkLocalFile(note.id);
      }

      // Remove managed directory
      await removeManagedDirectory(dir.id);
      setManagedFolderIds((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });

      await refreshSidebarData();
      notifyLocalChange();
      setSuccessToast("Stopped managing folder locally");
    } catch (err) {
      console.error("Failed to stop managing folder locally:", err);
      showError("Failed to stop managing folder locally");
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

  function resolveFavoriteNote(noteId: string, cb: (note: Note) => void) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      cb(note);
      return;
    }
    fetchNoteById(noteId)
      .then((fetched) => {
        if (fetched) {
          setNotes((prev) =>
            prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev],
          );
          cb(fetched);
        }
      })
      .catch(() => showError("Favorited note not found"));
  }

  function handleFavoriteNoteSelect(noteId: string) {
    resolveFavoriteNote(noteId, (note) => handleNoteSelect(note));
  }

  function handleFavoriteNoteOpen(noteId: string) {
    if (openTabs.includes(noteId)) {
      if (previewTabId === noteId) {
        setPreviewTabId(null);
      }
      const note = notes.find((n) => n.id === noteId);
      if (note) selectNote(note);
      return;
    }
    resolveFavoriteNote(noteId, (note) => openNoteAsTab(note));
  }

  async function handleDeleteFolder(folderId: string, mode: "move-up" | "recursive") {
    try {
      // If this folder maps to a local directory, delete it on disk
      const localInfo = await findLocalDirForFolder(folderId);
      if (localInfo) {
        try {
          // If this is the root managed folder, stop watching and unregister
          if (localInfo.managedDir.rootFolderId === folderId) {
            await stopDirectoryWatching(localInfo.dirPath);
            await removeManagedDirectory(localInfo.managedDir.id);
            setManagedFolderIds((prev) => {
              const next = new Set(prev);
              next.delete(folderId);
              return next;
            });
          }
          const { remove: fsRemove } = await import("@tauri-apps/plugin-fs");
          await moveToTrash(localInfo.dirPath);
        } catch (err) {
          console.error("Failed to delete directory on disk:", err);
        }
      }

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
      loadFavoriteNotes();
      setDashboardKey((k) => k + 1);
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
  refreshTrashCountRef.current = () => {
    fetchTrash()
      .then((trash) => setTrashCount(trash.length))
      .catch(() => {});
  };
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
    setImportChoiceDialog({ files, paths: filePaths, fileNames, autoSelect, folderName, dirPath: folderName ? paths[0] : undefined });
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
    }
  }

  async function handleKeepLocal() {
    if (!importChoiceDialog) return;
    const { files, paths, autoSelect, folderName, dirPath } = importChoiceDialog;
    setImportChoiceDialog(null);
    let targetFolderId = activeFolder && activeFolder !== "__unfiled__" ? activeFolder : null;

    // If a folder was dropped, create it and place notes inside.
    // When dirPath is set this import is registering the folder as a
    // managed directory (see addManagedDirectory call below) — flag the
    // container folder as managed-locally so the server + web see it.
    if (folderName) {
      const folder = await createFolder(
        folderName,
        targetFolderId ?? undefined,
        { isLocalFile: Boolean(dirPath) },
      );
      targetFolderId = folder.id;
    }

    // Register as a managed directory if a folder was dropped
    if (dirPath) {
      try {
        const { conflicts, reason } = await isPathConflicting(dirPath);
        if (conflicts) {
          showError(reason || "Directory conflicts with an existing managed directory");
        } else {
          const existing = await getManagedDirectoryByPath(dirPath);
          if (!existing) {
            await addManagedDirectory(dirPath, targetFolderId);
            if (targetFolderId) {
              setManagedFolderIds((prev) => new Set([...prev, targetFolderId]));
            }
            // Start watching the directory
            await startDirectoryWatching(dirPath, {
              onFileCreated: (path) => handleDirectoryFileEvent(path, dirPath),
              onFileModified: (path) => handleDirectoryFileEvent(path, dirPath),
              onFileDeleted: (path) => handleDirectoryFileDeleted(path),
              onFileRenamed: (oldPath, newPath) => handleDirectoryFileRenamed(oldPath, newPath),
              onDirectoryCreated: () => handleDirectoryCreated(),
              onDirectoryDeleted: () => handleDirectoryDeleted(),
              onDirectoryRenamed: () => handleDirectoryRenamed(),
            });
          }
        }
      } catch (err) {
        console.error("Failed to register managed directory:", err);
      }
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
      // Track which notes are hosted on THIS device
      setLocallyHostedNoteIds(new Set(localNotes.map((n) => n.id)));
      // Don't return early — managed directory logic must run even with 0 local notes

      if (localNotes.length > 0) {
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
      } // end if (localNotes.length > 0)

      // --- Managed directory reconciliation and watchers ---
      const managedDirs = await listManagedDirectories();
      // Update managed folder IDs for context menu display
      // Collect managed root IDs AND all their descendant folder IDs
      const mfIds = new Set<string>();
      // Always add the root folder IDs first
      for (const dir of managedDirs) {
        if (dir.rootFolderId) mfIds.add(dir.rootFolderId);
      }
      // Then add all descendant folder IDs
      const allFoldersNow = await fetchFolders();
      function collectDescendantIds(items: FolderInfo[], ids: Set<string>) {
        for (const f of items) {
          ids.add(f.id);
          collectDescendantIds(f.children, ids);
        }
      }
      for (const dir of managedDirs) {
        if (dir.rootFolderId) {
          // Find the root in the tree and collect its children
          function findAndCollect(items: FolderInfo[]) {
            for (const f of items) {
              if (f.id === dir.rootFolderId) {
                collectDescendantIds(f.children, mfIds);
                return true;
              }
              if (findAndCollect(f.children)) return true;
            }
            return false;
          }
          findAndCollect(allFoldersNow);
        }
      }
      setManagedFolderIds(mfIds);

      if (managedDirs.length > 0) {
        // Reconcile: detect new/missing/changed files
        const missingNoteIds: string[] = [];
        const reconcileResults = await reconcileAllDirectories(
          managedDirs,
          (dirPath) => fetchTrackedFilesInDirectory(dirPath),
          createNote,
          linkNoteToLocalFile,
          findNoteByLocalPath,
          handleExternalChange,
          (noteId) => {
            // Soft-delete notes whose files are missing from managed directories
            softDeleteNote(noteId).catch(() => {});
            enqueueSyncAction("delete", noteId, "note").catch(() => {});
            closeDeletedNoteTabRef.current(noteId);
            missingNoteIds.push(noteId);
          },
        );

        const totalNew = reconcileResults.reduce((sum, r) => sum + r.newFiles, 0);
        const totalMissing = reconcileResults.reduce((sum, r) => sum + r.missingFiles, 0);
        if (totalNew > 0 || totalMissing > 0) {
          await refreshSidebarData();
          notifyLocalChange();
        }
        if (totalMissing > 0) {
          setSuccessToast(`${totalMissing} note${totalMissing === 1 ? "" : "s"} removed — file${totalMissing === 1 ? "" : "s"} no longer on disk`);
        }

        // Start directory watchers
        for (const dir of managedDirs) {
          await startDirectoryWatching(dir.path, {
            onFileCreated: (path) => handleDirectoryFileEvent(path, dir.path),
            onFileModified: (path) => handleDirectoryFileEvent(path, dir.path),
            onFileDeleted: (path) => handleDirectoryFileDeleted(path),
            onFileRenamed: (oldPath, newPath) => handleDirectoryFileRenamed(oldPath, newPath),
            onDirectoryCreated: () => handleDirectoryCreated(),
            onDirectoryDeleted: () => handleDirectoryDeleted(),
            onDirectoryRenamed: () => handleDirectoryRenamed(),
          });
        }

        // Start periodic reconciliation (30s) as a safety net.
        // Indexes new files into correct folders and cleans up stale
        // NoteSync folders that no longer exist on disk.
        startDirectoryReconcileTimer(async () => {
          let changed = false;
          const currentDirs = await listManagedDirectories();
          for (const dir of currentDirs) {
            // Clean up notes whose local files no longer exist on disk
            const trackedNotes = await fetchTrackedFilesInDirectory(dir.path);
            for (const tracked of trackedNotes) {
              const stillExists = await fileExists(tracked.localPath);
              if (!stillExists) {
                const noteForToast = await fetchNoteById(tracked.id);
                await processDeletedNote(tracked.id, noteForToast?.title || "Untitled", tracked.localPath);
                changed = true;
              }
            }

            // Index new files (creates folders as needed via resolveFolderForPath)
            const filesOnDisk = await scanDirectory(dir.path);
            for (const filePath of filesOnDisk) {
              const existing = await findNoteByLocalPath(filePath);
              if (!existing) {
                const folderId = dir.rootFolderId
                  ? (await resolveFolderForPath(dir.path, dir.rootFolderId, filePath)) ?? undefined
                  : undefined;
                const result = await autoIndexFile(filePath, createNote, linkNoteToLocalFile, findNoteByLocalPath, folderId, restoreNoteByLocalPath);
                if (result?.isNew) changed = true;
              }
            }

            // Recursively sync NoteSync folders with disk directories.
            if (dir.rootFolderId) {
              try {
                const { readDir: fsReadDir } = await import("@tauri-apps/plugin-fs");
                const allFolders = await fetchFolders();

                // Find a folder node by ID in the tree
                function findNode(items: FolderInfo[], id: string): FolderInfo | null {
                  for (const f of items) {
                    if (f.id === id) return f;
                    const found = findNode(f.children, id);
                    if (found) return found;
                  }
                  return null;
                }

                // Recursively sync a disk directory with a NoteSync folder
                async function syncLevel(diskPath: string, noteSyncParentId: string) {
                  const diskEntries = await fsReadDir(diskPath);
                  const diskDirNames = new Set(
                    diskEntries
                      .filter((e) => e.isDirectory && !e.name.startsWith("."))
                      .map((e) => e.name),
                  );

                  const parentNode = findNode(allFolders, noteSyncParentId);
                  const childFolders = parentNode?.children ?? [];

                  // Remove NoteSync folders not on disk — hard-delete for managed folders
                  for (const child of childFolders) {
                    if (!diskDirNames.has(child.name)) {
                      await hardDeleteFolder(child.id);
                      changed = true;
                    }
                  }

                  // Create/recurse into matching folders. Folders mirrored
                  // from disk under a managed root inherit isLocalFile=true.
                  const childMap = new Map(childFolders.map((f) => [f.name, f]));
                  for (const dirName of diskDirNames) {
                    const childDiskPath = `${diskPath}/${dirName}`;
                    let nsFolder = childMap.get(dirName);
                    if (!nsFolder) {
                      const created = await createFolder(dirName, noteSyncParentId, {
                        isLocalFile: true,
                      });
                      changed = true;
                      await syncLevel(childDiskPath, created.id);
                    } else {
                      await syncLevel(childDiskPath, nsFolder.id);
                    }
                  }
                }

                await syncLevel(dir.path, dir.rootFolderId);
              } catch {
                // Ignore errors during reconciliation scan
              }
            }
          }
          if (changed) await refreshSidebarData();
        });
      }
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

  // --- Directory watcher event handlers ---

  async function handleDirectoryFileEvent(filePath: string, _dirPath: string) {
    // Watcher only handles modifications to existing tracked files.
    // New file indexing and deletions are handled by the reconciliation timer.
    const existing = await findNoteByLocalPath(filePath);
    if (existing) {
      const content = await readLocalFile(filePath);
      const hash = await computeContentHash(content);
      handleExternalChange(existing.id, content, hash);
    }
  }

  async function handleDirectoryFileDeleted(_filePath: string) {
    // No-op: file deletion handled by reconciliation timer
  }

  // Used by reconciliation to show toast when a note is deleted
  async function processDeletedNote(noteId: string, noteTitle: string, filePath: string) {
    try {
      // Hard-delete locally only — do NOT enqueue sync delete.
      // The reconciliation detects missing files and cleans up locally.
      // Sync deletes are only triggered by explicit user actions (web/desktop UI).
      // This prevents stale sync deletes from round-tripping.
      await hardDeleteNote(noteId).catch(() => {});

      // Remove from notes list
      setNotes((prev) => prev.filter((n) => n.id !== noteId));

      // Close tab if open
      closeDeletedNoteTabRef.current(noteId);

      // Clean up local file status
      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.delete(noteId);
        return next;
      });

      await refreshSidebarData();
      notifyLocalChange();

      // Toast with undo
      showToast(`"${noteTitle}" removed — file deleted from disk`, 30000, {
        noteId,
        filePath,
      });
    } catch (err) {
      console.error("[dir-watcher] Failed to soft-delete note:", err);
    }
  }

  async function handleDirectoryFileRenamed(oldPath: string, newPath: string) {
    const existing = await findNoteByLocalPath(oldPath);
    if (!existing) return;

    try {
      // Update the local path
      const content = await readLocalFile(newPath);
      const hash = await computeContentHash(content);
      await linkNoteToLocalFile(existing.id, newPath, hash);
      lastProcessedHashRef.current.set(existing.id, hash);

      setLocalFileStatuses((prev) => {
        const next = new Map(prev);
        next.set(existing.id, "synced");
        return next;
      });

      // Derive new title from filename if it changed
      const { titleFromFilename } = await import("../lib/localFileService.ts");
      const newTitle = titleFromFilename(newPath);
      const note = notes.find((n) => n.id === existing.id);
      if (note && note.title !== newTitle) {
        await updateNote(existing.id, { title: newTitle });
        await refreshSidebarData();
      }

      notifyLocalChange();
      console.log(`[dir-watcher] Rename detected: ${oldPath} → ${newPath}`);
    } catch (err) {
      console.error("[dir-watcher] Failed to handle rename:", err);
    }
  }

  // Directory create/delete/rename are all handled by the reconciliation timer.
  // Watcher callbacks are no-ops to avoid race conditions.
  async function handleDirectoryCreated() { /* reconciliation handles */ }
  async function handleDirectoryDeleted() { /* reconciliation handles */ }
  async function handleDirectoryRenamed() { /* reconciliation handles */ }

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
    // For managed files: skip dialog, go straight to OS trash + hard-delete
    // handleDeleteNote already handles this for isLocalFile notes
    handleDeleteNote(noteId);
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

          const currentNoteId = selectedIdRef.current;
          if (imagePaths.length > 0 && currentNoteId) {
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
                  // Use Uint8Array directly — data.buffer can have wrong offset in Tauri WebView
                  const file = new File([new Uint8Array(data)], name, { type: mimeMap[ext] || "image/png" });
                  const result = await uploadImage(currentNoteId, file);
                  // Insert markdown at cursor position
                  const imgName = name.replace(/\.[^.]+$/, "");
                  const md = `\n![${imgName}](${result.r2Url})\n`;
                  const cursor = editorRef.current?.getEditorState()?.cursor ?? -1;
                  setContent((prev) => {
                    if (cursor >= 0 && cursor <= prev.length) {
                      return prev.slice(0, cursor) + md + prev.slice(cursor);
                    }
                    return prev + md;
                  });
                }
              } catch (err) {
                console.error("Image drop upload failed:", err);
                showError("Failed to upload image");
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

  const switcherNotes = useMemo(() => {
    const folderMap = new Map(folders.map((f) => [f.id, f.name]));
    return notes.map((n) => ({
      id: n.id,
      title: n.title || "Untitled",
      folderName: n.folderId ? folderMap.get(n.folderId) : undefined,
    }));
  }, [notes, folders]);

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
    if (drawerOpen && drawerTab === tab) {
      setDrawerOpen(false);
    } else {
      setDrawerTab(tab);
      setDrawerOpen(true);
    }
  }

  async function handleQaSelectNote(noteId: string) {
    if (sidebarView === "trash") {
      setSidebarView("notes");
    }
    const note = notes.find((n) => n.id === noteId) ?? tabNoteCacheRef.current.get(noteId);
    if (note) {
      openNoteAsTab(note);
    } else {
      const fetched = await fetchNoteById(noteId);
      if (fetched) {
        openNoteAsTab(fetched);
      }
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
    if (!selectedId || !selectedNote || isSuggestingTags) return;
    setIsSuggestingTags(true);
    try {
      if (isDirty()) {
        await handleSave();
      }
      const suggested = await suggestTagsApi(selectedId);
      // Add suggested tags directly to the note, deduplicating
      const currentTags = selectedNote.tags ?? [];
      const newTags = [...new Set([...currentTags, ...suggested])];
      if (newTags.length > currentTags.length) {
        await handleUpdateTags(selectedId, newTags);
      }
    } catch {
      showError("Failed to suggest tags");
    } finally {
      setIsSuggestingTags(false);
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
          setSettingsInitialSection(undefined);
          setSettingsInitialAction(undefined);
        }}
        initialSection={settingsInitialSection}
        initialAction={settingsInitialAction}
        onChangePassword={() => {
          setShowSettings(false);
          setShowChangePassword(true);
        }}
        onSignOut={logout}
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
    <div className="flex flex-col h-full">
    {/* Recording bar — top of window, animated */}
    <div
      className="transition-[max-height,opacity] duration-300 ease-in-out shrink-0"
      style={{
        maxHeight: recordingState && (recordingState.state === "recording" || recordingState.state === "processing") ? "36px" : "0px",
        opacity: recordingState && (recordingState.state === "recording" || recordingState.state === "processing") ? 1 : 0,
        overflow: recordingState && (recordingState.state === "recording" || recordingState.state === "processing") ? "visible" : "hidden",
      }}
    >
      {recordingState && (
        <RecordingBar
          state={recordingState.state as "recording" | "processing"}
          elapsed={recordingState.elapsed}
          mode={recordingState.mode}
          stream={recordingState.stream}
          audioLevel={recordingState.audioLevel}
          folderId={recordingFolderId ?? undefined}
          folders={flatFolders}
          onFolderChange={(id) => setRecordingFolderId(id ?? null)}
          onStop={recordingState.onStop}
        />
      )}
    </div>
    <div className="flex flex-1 min-h-0">
      {/* Ribbon — always visible */}
      <Ribbon
        onNewNote={handleCreate}
        showAudio={aiSettings.masterAiEnabled && aiSettings.audioNotes}
        onRecord={(mode) => setRecordTrigger({ mode, key: Date.now() })}
        recorderState={recordingState?.state ?? "idle"}
        syncStatus={syncStatusState}
        syncError={syncErrorState}
        onSync={manualSync}
        hasRejections={syncRejections.length > 0}
        onViewIssues={() => setShowSyncIssuesDialog(true)}
        onGame={() => setShowGame(true)}
        onTrash={handleViewTrash}
        trashCount={trashCount}
        showTrash={sidebarView === "notes"}
        onImportFiles={(files) => handleImportFiles(files)}
        onImportDirectory={(files) => handleImportFiles(files)}
        onImportDirectoryPath={(path) => handleImportPaths([path])}
        showImport={sidebarView === "notes"}
        onSettings={() => setShowSettings(true)}
        onSignOut={logout}
      />

      {/* Shared DndContext for sidebar + note list (enables drag from notes to folders) */}
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => setActiveDragId(String(event.active.id))}
        onDragEnd={(event: DragEndEvent) => { setActiveDragId(null); handleDragEnd(event); }}
        onDragCancel={() => setActiveDragId(null)}
      >

      {/* Sidebar */}
      <aside
        className={`bg-sidebar flex flex-col shrink-0 overflow-hidden ${sidebarResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
        style={{ width: focusMode || collapseSidebar || sidebarHidden ? 0 : collapseNoteList ? Math.max(sidebarResize.size, 280) : sidebarResize.size }}
      >

        {sidebarView === "notes" ? (
          <>
            {/* Sidebar tabs */}
            <SidebarTabs
              activePanel={sidebarPanel}
              onPanelChange={setSidebarPanel}
              showFavorites={favoriteFolders.length > 0 || favoriteNotes.length > 0}
            />

            {/* Sidebar panel content — switches based on active tab */}
            <div key={sidebarPanel} className={`${collapseNoteList ? "shrink-0 h-1/2" : "flex-1"} flex flex-col min-h-0 animate-fade-in`}>
              {sidebarPanel === "explorer" && (
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
                    onSaveLocally={handleSaveFolderLocally}
                    onStopManagingLocally={handleStopManagingFolderLocally}
                    managedFolderIds={managedFolderIds}
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
                    <div className="flex items-center rounded-md bg-input border border-border focus-within:border-muted-foreground">
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
                  </div>
                  {/* Search results */}
                  {searchQuery && (
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
                    <NoteListPanel
                      notes={filteredNotes}
                      selectedId={selectedId}
                      isLoading={isLoading}
                      isSearchResults={false}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSortByChange={setSortBy}
                      onSortOrderChange={setSortOrder}
                      onSelect={handleNoteSelect}
                      onDoubleClick={openNoteAsTab}
                      onDeleteNote={handleLocalFileDelete}
                      onExportNote={handleExportNote}
                      onToggleFavorite={handleToggleNoteFavorite}
                      onCreate={handleCreate}
                      localFileStatuses={localFileStatuses}
                      locallyHostedNoteIds={locallyHostedNoteIds}
                      onUnlinkLocalFile={handleUnlinkLocalFile}
                      onSaveAsLocalFile={handleSaveAsLocalFile}
                    />
                </div>
              </>
            )}
          </>
        ) : (
          <TrashPanel
            notes={trashNotes}
            selectedId={selectedId}
            onSelect={selectNote}
            onRestore={async (ids) => {
              for (const id of ids) {
                await handleRestoreNote(id);
              }
            }}
            onDelete={async (ids) => {
              if (ids.length === trashNotes.length) {
                await handleEmptyTrash();
              } else {
                const idSet = new Set(ids);
                await bulkHardDelete(ids);
                setTrashNotes((prev) => prev.filter((n) => !idSet.has(n.id)));
                setTrashCount((c) => Math.max(0, c - ids.length));
                if (selectedId && idSet.has(selectedId)) {
                  setSelectedId(null);
                  setTitle("");
                  setContent("");
                }
              }
            }}
            onBack={() => {
              setSidebarView("notes");
              setSelectedId(null);
              setTitle("");
              setContent("");
            }}
          />
        )}

        {/* Sidebar bottom bar */}
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
              <NoteListPanel
                notes={filteredNotes}
                selectedId={selectedId}
                isLoading={isLoading}
                isSearchResults={false}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortByChange={setSortBy}
                onSortOrderChange={setSortOrder}
                onSelect={handleNoteSelect}
                onDoubleClick={openNoteAsTab}
                onDeleteNote={handleLocalFileDelete}
                onExportNote={handleExportNote}
                onToggleFavorite={handleToggleNoteFavorite}
                onCreate={handleCreate}
                localFileStatuses={localFileStatuses}
                locallyHostedNoteIds={locallyHostedNoteIds}
                onUnlinkLocalFile={handleUnlinkLocalFile}
                onSaveAsLocalFile={handleSaveAsLocalFile}
                onSaveToFile={handleSaveToFile}
                onUseLocalVersion={handleUseLocalVersion}
                onViewDiff={handleViewDiff}
              />
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

      <DragOverlay dropAnimation={null}>
        {activeDragId && (() => {
          const note = notes.find((n) => n.id === activeDragId);
          if (note) {
            return (
              <div className="px-3 py-2 bg-card border border-border rounded-md shadow-lg text-sm text-foreground truncate max-w-[200px] opacity-90">
                {note.title || "Untitled"}
              </div>
            );
          }
          return null;
        })()}
      </DragOverlay>
      </DndContext>

      {/* Editor area */}
      <main
        ref={mainRef}
        className="flex-1 flex min-w-0 relative overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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
              onCreate={() => { void handleCreate(); }}
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
                content={stripFrontmatter(selectedNote.content)}
                className="flex-1"
              />
            </div>
          </>
        ) : selectedNote ? (
          <>
            {/* Toolbar status bar */}
            <div className="flex items-center gap-1.5 px-4 py-1 border-b border-border shrink-0">
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
              <button
                onClick={() => {
                  if (aiSettings.masterAiEnabled && aiSettings.summarize) {
                    handleSummarize();
                  } else {
                    setShowManualSummary(true);
                    setSummaryDraft("");
                    setEditingSummary(true);
                  }
                }}
                disabled={isSummarizing}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title={isSummarizing ? "Summarizing..." : aiSettings.masterAiEnabled && aiSettings.summarize ? "Summarize" : "Add summary"}
                aria-label="Summarize"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>
              </button>
              <button
                onClick={() => {
                  if (aiSettings.masterAiEnabled && aiSettings.tagSuggestions) {
                    handleSuggestTags();
                  } else {
                    setShowManualTags(true);
                  }
                }}
                disabled={isSuggestingTags}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title={isSuggestingTags ? "Suggesting..." : aiSettings.masterAiEnabled && aiSettings.tagSuggestions ? "Suggest tags" : "Add tags"}
                aria-label="Tags"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </button>
              {selectedNote?.transcript && (
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    showTranscript
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title={showTranscript ? "Close transcript" : "View transcript"}
                  aria-label="View transcript"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
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
              <div className={`absolute bottom-1.5 flex items-center ${selectedNote?.isLocalFile ? "left-4" : "left-2"}`}>
                {selectedNote?.isLocalFile && (
                  <span
                    className={`shrink-0 mr-0.5 ${selectedId && locallyHostedNoteIds.has(selectedId) ? "text-primary" : "text-muted-foreground"}`}
                    title={selectedId && locallyHostedNoteIds.has(selectedId) ? "Managed locally on this device" : "Managed locally on another device"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </span>
                )}
                <FolderPicker
                  selectedId={selectedNote?.folderId ?? null}
                  folders={flatFolders}
                  onChange={async (folderId) => {
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
                  className="w-8 h-4 flex items-center justify-center"
                  ariaLabel="Note folder"
                  testId="note-folder-select"
                />
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
              <p className={`pr-4 pb-1.5 -mt-1 text-[10px] text-muted-foreground truncate ${selectedNote?.isLocalFile ? "pl-[60px]" : "pl-9"}`}>
                {selectedNote?.folderId
                  ? getFolderBreadcrumb(folders, selectedNote.folderId).map((f) => f.name).join(" / ")
                  : "Unfiled"}
              </p>
            </div>

            {/* Summary */}
            {(selectedNote?.summary || showManualSummary || isSummarizing) && (
              <div className="px-4 py-1.5 border-b border-border">
                <div className="flex items-start gap-1">
                  {selectedNote?.summary && !editingSummary && (summaryOverflows || summaryExpanded) && (
                    <button
                      onClick={() => setSummaryExpanded((prev) => !prev)}
                      className="shrink-0 mt-[5px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title={summaryExpanded ? "Collapse summary" : "Expand summary"}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform duration-300 ease-in-out ${summaryExpanded ? "" : "-rotate-90"}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                  {isSummarizing ? (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground italic">
                      <span className="inline-flex gap-0.5 mr-1.5"><span className="bounce-dot" /><span className="bounce-dot" /><span className="bounce-dot" /></span>Generating summary
                    </span>
                  ) : editingSummary ? (
                    <textarea
                      autoFocus
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const trimmed = summaryDraft.trim();
                          if (trimmed && selectedId) {
                            updateNote(selectedId, { summary: trimmed }).then((updated) => {
                              setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
                              notifyLocalChange();
                            }).catch(() => showError("Failed to update summary"));
                          }
                          setEditingSummary(false);
                          setShowManualSummary(false);
                        } else if (e.key === "Escape") {
                          setEditingSummary(false);
                          setShowManualSummary(false);
                        }
                      }}
                      onBlur={() => {
                        setEditingSummary(false);
                        setShowManualSummary(false);
                      }}
                      placeholder="Add a summary..."
                      className="flex-1 min-w-0 text-sm text-muted-foreground italic bg-transparent border border-border rounded px-1 py-0 focus:outline-none focus:border-primary resize-none"
                      rows={2}
                    />
                  ) : (
                    <p
                      ref={summaryTextRef}
                      className={`flex-1 min-w-0 text-sm text-muted-foreground italic cursor-default ${summaryExpanded ? "" : "truncate"}`}
                      onDoubleClick={() => {
                        setSummaryDraft(selectedNote?.summary ?? "");
                        setSummaryExpanded(true);
                        setEditingSummary(true);
                      }}
                      title="Double-click to edit"
                    >
                      {selectedNote?.summary}
                    </p>
                  )}
                  {selectedNote?.summary && !editingSummary && (
                    <button
                      onClick={() => setConfirmDeleteSummary(true)}
                      className="shrink-0 mt-[3px] w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Remove summary"
                    >
                      &times;
                    </button>
                  )}
                </div>
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
            {/* Tag input — shown when tags exist, manually opened, or generating */}
            {(selectedNote.tags.length > 0 || showManualTags || isSuggestingTags) && (
              isSuggestingTags && selectedNote.tags.length === 0 ? (
                <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border">
                  <span className="text-xs text-muted-foreground">
                    <span className="inline-flex gap-0.5 mr-1.5"><span className="bounce-dot" /><span className="bounce-dot" /><span className="bounce-dot" /></span>Generating tags
                  </span>
                </div>
              ) : (
                <TagInput
                  tags={selectedNote.tags}
                  allTags={tags.map((t) => t.name)}
                  onChange={(newTags) => {
                    handleUpdateTags(selectedId!, newTags);
                    if (newTags.length === 0) setShowManualTags(false);
                  }}
                  autoFocus={showManualTags && selectedNote.tags.length === 0}
                  onBlurEmpty={() => setShowManualTags(false)}
                  loading={isSuggestingTags}
                />
              )
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
            ) : showTranscript && selectedNote?.transcript ? (
              <div className="flex-1 min-h-0 animate-fade-in">
                <TranscriptViewer
                  transcript={selectedNote.transcript}
                  onClose={() => setShowTranscript(false)}
                />
              </div>
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
                  onToggleLineNumbers={() => setShowLineNumbers((prev) => !prev)}
                  showFrontmatter={editorSettings.propertiesMode === "source"}
                  onToggleFrontmatter={() => updateEditorSetting("propertiesMode", editorSettings.propertiesMode === "source" ? "panel" : "source")}
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
                      showLineNumbers={viewMode === "live" ? false : showLineNumbers}
                      wordWrap={editorSettings.wordWrap}
                      tabSize={editorSettings.tabSize}
                      fontSize={editorSettings.editorFontSize}
                      theme={resolvedTheme}
                      accentColor={accentHex}
                      cursorStyle={editorSettings.cursorStyle}
                      cursorBlink={editorSettings.cursorBlink}
                      enableLivePreview={viewMode === "live"}
                      viewMode={viewMode}
                      hideFrontmatter={editorSettings.propertiesMode === "panel"}
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
                      content={stripFrontmatter(content)}
                      className={viewMode === "split" ? "flex-1 min-w-0 overflow-auto" : "flex-1 overflow-auto"}
                      wikiLinkTitleMap={wikiLinkTitleMap}
                      onWikiLinkClick={handleWikiLinkClick}
                      onContentChange={(newContent) => setContent(newContent)}
                      onEditAtLine={handleEditAtLine}
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
          <div className="flex-1 animate-fade-in">
            <Dashboard
              refreshKey={dashboardKey}
              onSelectNote={handleDashboardSelectNote}
              onCreateNote={handleCreate}
              onStartRecording={handleDashboardStartRecording}
              onImportFile={handleDashboardImportFile}
              audioNotesEnabled={aiSettings.masterAiEnabled && aiSettings.audioNotes}
            />
          </div>
        )}
      </div>

      {/* Sliding drawer with tabbed content */}
      <div className="relative shrink-0 overflow-visible self-stretch">
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
          className={`h-full overflow-hidden ${!drawerMountedRef.current || drawerResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
          style={{ width: drawerOpen ? drawerResize.size : 0 }}
        >
          <div className="h-full flex bg-card shadow-lg" style={{ width: drawerResize.size }}>
            <ResizeDivider
              direction="vertical"
              isDragging={drawerResize.isDragging}
              onPointerDown={drawerResize.onPointerDown}
            />
            <div key={drawerTab} className="flex-1 min-w-0 h-full animate-fade-in">
              {drawerTab === "assistant" && aiSettings.masterAiEnabled && aiSettings.qaAssistant ? (
                <AIAssistantPanel
                  onSelectNote={handleQaSelectNote}
                  isOpen={drawerOpen}
                  isRecording={isRecording ?? false}
                  isSearchingContext={meetingContext.isSearching}
                  liveTranscript={recordingState?.liveTranscript ?? ""}
                  relevantNotes={meetingContext.relevantNotes}
                  recordingMode={recordingState?.mode}
                  completedNote={completedAudioNote}
                  activeNote={selectedNote ? { id: selectedNote.id, title: selectedNote.title, content } : null}
                  chatRefreshKey={chatRefreshKey}
                />
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
      {/* Trash bulk delete confirmation is now handled inline by TrashPanel */}

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
      {toastStack.length > 0 && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
          {toastStack.map((toast) => (
            <div key={toast.id} className="bg-card border border-primary rounded-md px-4 py-3 shadow-lg flex items-center gap-3 animate-fade-in">
              <span className="text-sm text-foreground">{toast.message}</span>
              {toast.undoData && (
                <button
                  onClick={async () => {
                    const undo = toast.undoData!;
                    dismissToast(toast.id);
                    try {
                      await restoreNote(undo.noteId);
                      const restored = await fetchNoteById(undo.noteId);
                      if (restored) {
                        const hash = await writeLocalFile(undo.filePath, restored.content);
                        await linkNoteToLocalFile(undo.noteId, undo.filePath, hash);
                        setLocalFileStatuses((prev) => {
                          const next = new Map(prev);
                          next.set(undo.noteId, "synced");
                          return next;
                        });
                      }
                      await refreshSidebarData();
                      notifyLocalChange();
                      showToast("Note restored", 3000);
                    } catch {
                      showError("Failed to undo deletion");
                    }
                  }}
                  className="text-primary hover:text-primary/80 text-sm font-medium cursor-pointer"
                >
                  Undo
                </button>
              )}
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          ))}
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

    {/* SyncSwarm mini game */}
    {showGame && <SyncSwarmGame onExit={() => setShowGame(false)} />}

    {/* Audio Recorder (hidden — triggered by ribbon buttons) */}
    {aiSettings.masterAiEnabled && aiSettings.audioNotes && (
      <AudioRecorder
        headless
        defaultMode={aiSettings.audioMode}
        folderId={recordingFolderId ?? undefined}
        recordingSource={aiSettings.recordingSource}
        onRecordingSourceChange={(src) => updateAiSetting("recordingSource", src)}
        onNoteCreated={handleAudioNoteCreated}
        onError={showError}
        onRecordingStateChange={setRecordingState}
        onModeChange={(m) => updateAiSetting("audioMode", m)}
        triggerMode={recordTrigger?.mode}
        triggerKey={recordTrigger?.key}
      />
    )}

    {/* About Dialog */}
    {showAbout && (
      <AboutDialog
        onClose={() => setShowAbout(false)}
        onWhatsNew={() => {
          setShowAbout(false);
          setSettingsInitialSection("About");
          setSettingsInitialAction("whats-new");
          setShowSettings(true);
        }}
        onFeedback={() => {
          setShowAbout(false);
          setSettingsInitialSection("About");
          setSettingsInitialAction("feedback");
          setShowSettings(true);
        }}
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
