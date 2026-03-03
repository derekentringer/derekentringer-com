export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string | null;
  tags: string[];
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateNoteRequest {
  title: string;
  content?: string;
  folder?: string;
  tags?: string[];
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  folder?: string | null;
  tags?: string[];
}

export interface NoteListResponse {
  notes: Note[];
  total: number;
}

export type NoteSortField = "title" | "createdAt" | "updatedAt";
export type SortOrder = "asc" | "desc";

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
