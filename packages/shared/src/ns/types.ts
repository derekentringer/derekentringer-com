export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string | null;
  folderId: string | null;
  folderPath: string | null;
  tags: string[];
  summary: string | null;
  sortOrder: number;
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
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  folder?: string | null;
  folderId?: string | null;
  tags?: string[];
  summary?: string | null;
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

export interface SyncChange {
  id: string;
  action: "create" | "update" | "delete";
  note: Note | null;
  timestamp: string;
}

export interface SyncCursor {
  deviceId: string;
  lastSyncedAt: string;
}

export interface SyncPushRequest {
  deviceId: string;
  changes: SyncChange[];
}

export interface SyncPullResponse {
  changes: SyncChange[];
  cursor: SyncCursor;
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
