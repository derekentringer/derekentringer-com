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

export interface ReorderNotesRequest {
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncChange {
  id: string;
  type: "note" | "folder";
  action: "create" | "update" | "delete";
  data: Note | FolderSyncData | null;
  timestamp: string;
  force?: boolean;
}

export interface SyncRejection {
  changeId: string;
  changeType: "note" | "folder";
  changeAction: "create" | "update" | "delete";
  reason: "fk_constraint" | "unique_constraint" | "not_found" | "timestamp_conflict" | "unknown";
  message: string;
}

export interface SyncCursor {
  deviceId: string;
  lastSyncedAt: string;
}

export interface SyncPushRequest {
  deviceId: string;
  changes: SyncChange[];
}

export interface SyncPullRequest {
  deviceId: string;
  since: string;
}

export interface SyncPullResponse {
  changes: SyncChange[];
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
