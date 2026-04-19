import type {
  Note,
  NoteVersion,
  NoteVersionListResponse,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  FolderInfo,
  ReorderFavoriteNotesRequest,
  ReorderFoldersRequest,
  TagListResponse,
  BacklinksResponse,
  NoteTitlesResponse,
} from "@derekentringer/shared/ns";
import { apiFetch } from "./client.ts";

export async function fetchNotes(params?: {
  folder?: string;
  folderId?: string;
  search?: string;
  searchMode?: "keyword" | "semantic" | "hybrid";
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<NoteListResponse> {
  const qs = new URLSearchParams();
  if (params?.folderId) qs.set("folderId", params.folderId);
  else if (params?.folder) qs.set("folder", params.folder);
  if (params?.search) qs.set("search", params.search);
  if (params?.searchMode) qs.set("searchMode", params.searchMode);
  if (params?.tags && params.tags.length > 0) qs.set("tags", params.tags.join(","));
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);

  const query = qs.toString();
  const path = query ? `/notes?${query}` : "/notes";
  const response = await apiFetch(path);

  if (!response.ok) {
    throw new Error(`Failed to fetch notes: ${response.status}`);
  }

  return response.json();
}

export async function fetchNote(id: string): Promise<Note> {
  const response = await apiFetch(`/notes/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch note: ${response.status}`);
  }

  const data = await response.json();
  return data.note;
}

export async function createNote(
  data: CreateNoteRequest,
): Promise<Note> {
  const response = await apiFetch("/notes", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create note: ${response.status}`);
  }

  const result = await response.json();
  return result.note;
}

export async function updateNote(
  id: string,
  data: UpdateNoteRequest,
): Promise<Note> {
  const response = await apiFetch(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to update note: ${response.status}`);
  }

  const result = await response.json();
  return result.note;
}

export async function deleteNote(id: string): Promise<void> {
  const response = await apiFetch(`/notes/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete note: ${response.status}`);
  }
}

export async function fetchTrash(params?: {
  page?: number;
  pageSize?: number;
}): Promise<NoteListResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));

  const query = qs.toString();
  const path = query ? `/notes/trash?${query}` : "/notes/trash";
  const response = await apiFetch(path);

  if (!response.ok) {
    throw new Error(`Failed to fetch trash: ${response.status}`);
  }

  return response.json();
}

export async function restoreNote(id: string): Promise<Note> {
  const response = await apiFetch(`/notes/${id}/restore`, {
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Failed to restore note: ${response.status}`);
  }

  const result = await response.json();
  return result.note;
}

export async function permanentDeleteNote(id: string): Promise<void> {
  const response = await apiFetch(`/notes/${id}/permanent`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to permanently delete note: ${response.status}`);
  }
}

export async function emptyTrash(ids?: string[]): Promise<{ deleted: number }> {
  const options: RequestInit = { method: "DELETE" };
  if (ids) {
    options.body = JSON.stringify({ ids });
  }
  const response = await apiFetch("/notes/trash", options);

  if (!response.ok) {
    throw new Error(`Failed to empty trash: ${response.status}`);
  }

  return response.json();
}

export async function fetchFolders(): Promise<FolderListResponse> {
  const response = await apiFetch("/notes/folders");

  if (!response.ok) {
    throw new Error(`Failed to fetch folders: ${response.status}`);
  }

  return response.json();
}

export async function createFolderApi(
  name: string,
  parentId?: string,
): Promise<{ id: string; name: string; parentId: string | null; sortOrder: number }> {
  const body: Record<string, string> = { name };
  if (parentId) body.parentId = parentId;

  const response = await apiFetch("/notes/folders", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to create folder: ${response.status}`);
  }

  return response.json();
}

export async function renameFolderApi(
  folderId: string,
  newName: string,
): Promise<{ id: string; name: string }> {
  const response = await apiFetch(`/notes/folders/${encodeURIComponent(folderId)}`, {
    method: "PATCH",
    body: JSON.stringify({ newName }),
  });

  if (!response.ok) {
    throw new Error(`Failed to rename folder: ${response.status}`);
  }

  return response.json();
}

export async function deleteFolderApi(
  folderId: string,
  mode: "move-up" | "recursive" = "move-up",
): Promise<{ updated: number }> {
  const response = await apiFetch(`/notes/folders/${encodeURIComponent(folderId)}?mode=${mode}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete folder: ${response.status}`);
  }

  return response.json();
}

/**
 * Phase A.2 structured rejection when a folder move crosses the
 * managed/unmanaged boundary. Client catches this, shows the
 * appropriate confirmation dialog, and re-invokes `moveFolderApi`
 * with `confirmCrossBoundary: true`.
 */
export class CrossBoundaryMoveError extends Error {
  readonly code = "cross_boundary_move";
  readonly direction: "toManaged" | "toUnmanaged";
  readonly affectedFolderCount: number;
  readonly affectedNoteCount: number;

  constructor(body: {
    direction: "toManaged" | "toUnmanaged";
    affectedFolderCount: number;
    affectedNoteCount: number;
    message?: string;
  }) {
    super(body.message ?? "Cross-boundary folder move requires confirmation");
    this.direction = body.direction;
    this.affectedFolderCount = body.affectedFolderCount;
    this.affectedNoteCount = body.affectedNoteCount;
  }
}

export async function moveFolderApi(
  folderId: string,
  parentId: string | null,
  sortOrder?: number,
  opts?: { confirmCrossBoundary?: boolean },
): Promise<{ id: string; name: string; parentId: string | null; sortOrder: number }> {
  const body: Record<string, unknown> = { parentId };
  if (sortOrder !== undefined) body.sortOrder = sortOrder;

  const qs = opts?.confirmCrossBoundary ? "?confirmCrossBoundary=1" : "";
  const response = await apiFetch(
    `/notes/folders/${encodeURIComponent(folderId)}/move${qs}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );

  if (response.status === 409) {
    let parsed: {
      code?: string;
      direction?: "toManaged" | "toUnmanaged";
      affectedFolderCount?: number;
      affectedNoteCount?: number;
      message?: string;
    } = {};
    try {
      parsed = await response.json();
    } catch { /* ignore parse error */ }
    if (parsed.code === "cross_boundary_move" && parsed.direction) {
      throw new CrossBoundaryMoveError({
        direction: parsed.direction,
        affectedFolderCount: parsed.affectedFolderCount ?? 0,
        affectedNoteCount: parsed.affectedNoteCount ?? 0,
        message: parsed.message,
      });
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to move folder: ${response.status}`);
  }

  return response.json();
}

export async function reorderFoldersApi(
  order: { id: string; sortOrder: number }[],
): Promise<void> {
  const response = await apiFetch("/notes/folders/reorder", {
    method: "PUT",
    body: JSON.stringify({ order }),
  });

  if (!response.ok) {
    throw new Error(`Failed to reorder folders: ${response.status}`);
  }
}

export async function fetchTags(): Promise<TagListResponse> {
  const response = await apiFetch("/notes/tags");

  if (!response.ok) {
    throw new Error(`Failed to fetch tags: ${response.status}`);
  }

  return response.json();
}

export async function renameTagApi(
  name: string,
  newName: string,
): Promise<{ updated: number }> {
  const response = await apiFetch(`/notes/tags/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify({ newName }),
  });

  if (!response.ok) {
    throw new Error(`Failed to rename tag: ${response.status}`);
  }

  return response.json();
}

export async function getTrashRetention(): Promise<{ days: number }> {
  const response = await apiFetch("/notes/trash/retention");

  if (!response.ok) {
    throw new Error(`Failed to get trash retention: ${response.status}`);
  }

  return response.json();
}

export async function setTrashRetention(days: number): Promise<{ days: number }> {
  const response = await apiFetch("/notes/trash/retention", {
    method: "PUT",
    body: JSON.stringify({ days }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set trash retention: ${response.status}`);
  }

  return response.json();
}

export async function deleteTagApi(
  name: string,
): Promise<{ updated: number }> {
  const response = await apiFetch(`/notes/tags/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete tag: ${response.status}`);
  }

  return response.json();
}

export async function getVersionInterval(): Promise<{ minutes: number }> {
  const response = await apiFetch("/notes/versions/interval");

  if (!response.ok) {
    throw new Error(`Failed to get version interval: ${response.status}`);
  }

  return response.json();
}

export async function setVersionInterval(minutes: number): Promise<{ minutes: number }> {
  const response = await apiFetch("/notes/versions/interval", {
    method: "PUT",
    body: JSON.stringify({ minutes }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set version interval: ${response.status}`);
  }

  return response.json();
}

export async function fetchBacklinks(noteId: string): Promise<BacklinksResponse> {
  const response = await apiFetch(`/notes/${noteId}/backlinks`);

  if (!response.ok) {
    throw new Error(`Failed to fetch backlinks: ${response.status}`);
  }

  return response.json();
}

export async function fetchNoteTitles(): Promise<NoteTitlesResponse> {
  const response = await apiFetch("/notes/titles");

  if (!response.ok) {
    throw new Error(`Failed to fetch note titles: ${response.status}`);
  }

  return response.json();
}

export async function fetchVersions(
  noteId: string,
  params?: { page?: number; pageSize?: number },
): Promise<NoteVersionListResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));

  const query = qs.toString();
  const path = query
    ? `/notes/${noteId}/versions?${query}`
    : `/notes/${noteId}/versions`;
  const response = await apiFetch(path);

  if (!response.ok) {
    throw new Error(`Failed to fetch versions: ${response.status}`);
  }

  return response.json();
}

export async function fetchVersion(
  noteId: string,
  versionId: string,
): Promise<NoteVersion> {
  const response = await apiFetch(`/notes/${noteId}/versions/${versionId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch version: ${response.status}`);
  }

  const data = await response.json();
  return data.version;
}

export async function fetchDashboardData(): Promise<{
  recentlyEdited: Note[];
  favorites: Note[];
  audioNotes: Note[];
}> {
  const response = await apiFetch("/notes/dashboard");

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard data: ${response.status}`);
  }

  return response.json();
}

export async function fetchFavoriteNotes(params?: {
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<{ notes: Note[] }> {
  const qs = new URLSearchParams();
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);

  const query = qs.toString();
  const path = query ? `/notes/favorites?${query}` : "/notes/favorites";
  const response = await apiFetch(path);

  if (!response.ok) {
    throw new Error(`Failed to fetch favorite notes: ${response.status}`);
  }

  return response.json();
}

export async function reorderFavoriteNotes(
  data: ReorderFavoriteNotesRequest,
): Promise<void> {
  const response = await apiFetch("/notes/favorites/reorder", {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to reorder favorite notes: ${response.status}`);
  }
}

export async function toggleFolderFavoriteApi(
  folderId: string,
  favorite: boolean,
): Promise<{ id: string; favorite: boolean }> {
  const response = await apiFetch(`/notes/folders/${encodeURIComponent(folderId)}/favorite`, {
    method: "PATCH",
    body: JSON.stringify({ favorite }),
  });

  if (!response.ok) {
    throw new Error(`Failed to toggle folder favorite: ${response.status}`);
  }

  return response.json();
}

export async function restoreVersion(
  noteId: string,
  versionId: string,
): Promise<Note> {
  const response = await apiFetch(
    `/notes/${noteId}/versions/${versionId}/restore`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(`Failed to restore version: ${response.status}`);
  }

  const data = await response.json();
  return data.note;
}
