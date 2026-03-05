import type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  FolderInfo,
  ReorderNotesRequest,
  ReorderFoldersRequest,
  TagListResponse,
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

export async function reorderNotes(
  data: ReorderNotesRequest,
): Promise<void> {
  const response = await apiFetch("/notes/reorder", {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to reorder notes: ${response.status}`);
  }
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

export async function moveFolderApi(
  folderId: string,
  parentId: string | null,
  sortOrder?: number,
): Promise<{ id: string; name: string; parentId: string | null; sortOrder: number }> {
  const body: Record<string, unknown> = { parentId };
  if (sortOrder !== undefined) body.sortOrder = sortOrder;

  const response = await apiFetch(`/notes/folders/${encodeURIComponent(folderId)}/move`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

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
