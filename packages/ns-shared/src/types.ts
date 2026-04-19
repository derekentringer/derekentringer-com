export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string | null;
  folderId: string | null;
  folderPath: string | null;
  tags: string[];
  summary: string | null;
  favorite: boolean;
  sortOrder: number;
  favoriteSortOrder: number;
  isLocalFile: boolean;
  audioMode: AudioMode | null;
  transcript: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateNoteRequest {
  title: string;
  content?: string;
  folder?: string;
  folderId?: string;
  tags?: string[];
  audioMode?: AudioMode;
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  folder?: string | null;
  folderId?: string | null;
  tags?: string[];
  summary?: string | null;
  favorite?: boolean;
  isLocalFile?: boolean;
  transcript?: string | null;
}

export interface NoteListResponse {
  notes: Note[];
  total: number;
}

export type NoteSortField = "title" | "createdAt" | "updatedAt" | "sortOrder";
export type FolderSortField = "name" | "createdAt";
export type SortOrder = "asc" | "desc";

export interface FolderInfo {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  favorite: boolean;
  count: number;
  totalCount: number;
  createdAt: string;
  /**
   * True when this folder is backed by an on-disk directory managed by a
   * desktop instance. Reading clients (e.g. web) use this to decide
   * whether deleting the folder should hard-delete and warn the user
   * about on-disk consequences. Optional because older wire payloads
   * may omit it.
   */
  isLocalFile?: boolean;
  children: FolderInfo[];
}

export interface FolderListResponse {
  folders: FolderInfo[];
}

export interface CreateFolderRequest {
  name: string;
  parentId?: string;
}

export interface MoveFolderRequest {
  parentId: string | null;
  sortOrder?: number;
}

export interface ReorderFoldersRequest {
  order: { id: string; sortOrder: number }[];
}

export interface ReorderFavoriteNotesRequest {
  order: { id: string; favoriteSortOrder: number }[];
}

export interface TagInfo {
  name: string;
  count: number;
}

export interface TagListResponse {
  tags: TagInfo[];
}

export interface NoteSearchResult extends Note {
  headline?: string;
}

export interface FolderSyncData {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  favorite: boolean;
  /**
   * True when this folder is backed by an on-disk directory managed by a
   * desktop instance. Optional on the wire for backward compatibility —
   * clients written before Phase 1 may omit it; the server treats the
   * absence as `false`.
   */
  isLocalFile?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ImageSyncData {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  r2Url: string;
  altText: string;
  aiDescription: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncChange {
  id: string;
  type: "note" | "folder" | "image";
  action: "create" | "update" | "delete";
  data: Note | FolderSyncData | ImageSyncData | null;
  timestamp: string;
  force?: boolean;
}

export interface SyncRejection {
  changeId: string;
  changeType: "note" | "folder" | "image";
  changeAction: "create" | "update" | "delete";
  reason: "fk_constraint" | "unique_constraint" | "not_found" | "timestamp_conflict" | "unknown";
  message: string;
}

export interface SyncCursor {
  deviceId: string;
  lastSyncedAt: string;
  /**
   * Per-entity-type keyset pagination cursor (Phase 2.2). When a pull
   * batch hits BATCH_LIMIT for a given type, the server returns the
   * last returned item's id here so the next pull can resume with
   * `(updatedAt > lastSyncedAt) OR (updatedAt = lastSyncedAt AND id > lastId)`.
   * Without this, rows sharing a single updatedAt value can straddle
   * the BATCH_LIMIT boundary and be silently skipped. Optional for
   * backward compatibility with pre-Phase-2 clients.
   */
  lastIds?: {
    notes?: string;
    folders?: string;
    images?: string;
    tombstones?: string;
  };
}

export interface SyncPushRequest {
  deviceId: string;
  changes: SyncChange[];
}

export interface SyncPullRequest {
  deviceId: string;
  since: string;
  /** Per-type keyset tie-breaker ids; see SyncCursor.lastIds. */
  lastIds?: {
    notes?: string;
    folders?: string;
    images?: string;
    tombstones?: string;
  };
}

/**
 * Tombstone for a hard-deleted entity. Delivered via `/sync/pull` so
 * clients that still have the entity in their local cache can remove it.
 *
 * Scope: folders (all deletes) and notes with isLocalFile=true (the
 * sync-push path hard-deletes these). Regular notes use deletedAt-style
 * soft-deletes delivered as a normal SyncChange with action="delete".
 */
export interface SyncTombstone {
  id: string;
  type: "folder" | "note";
  deletedAt: string;
}

export interface SyncPullResponse {
  changes: SyncChange[];
  /**
   * Tombstones for hard-deleted entities. Optional for backward
   * compatibility — clients that predate Phase 1.5 simply ignore the
   * field (and their local rows go stale, which is the pre-existing
   * behavior they already tolerate).
   */
  tombstones?: SyncTombstone[];
  cursor: SyncCursor;
  hasMore: boolean;
}

export interface SyncPushResponse {
  applied: number;
  rejected: number;
  skipped: number;
  cursor: SyncCursor;
  rejections?: SyncRejection[];
}

export interface AiCompleteRequest {
  context: string;
}

export interface AiSummarizeRequest {
  noteId: string;
}

export interface AiSuggestTagsRequest {
  noteId: string;
}

export interface AiSuggestTagsResponse {
  tags: string[];
}

export interface EmbeddingStatus {
  enabled: boolean;
  pendingCount: number;
  totalWithEmbeddings: number;
}

export type AudioMode = "meeting" | "lecture" | "memo" | "verbatim";

export interface TranscribeResponse {
  title: string;
  content: string;
  tags: string[];
}

export interface QASource {
  id: string;
  title: string;
}

export interface BacklinkInfo {
  noteId: string;
  noteTitle: string;
  linkText: string;
}

export interface BacklinksResponse {
  backlinks: BacklinkInfo[];
}

export interface NoteTitleEntry {
  id: string;
  title: string;
}

export interface NoteTitlesResponse {
  notes: NoteTitleEntry[];
}

export interface NoteVersion {
  id: string;
  noteId: string;
  title: string;
  content: string;
  origin: string;
  createdAt: string;
}

export interface NoteVersionListResponse {
  versions: NoteVersion[];
  total: number;
}
