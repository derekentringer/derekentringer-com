import type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
  NoteSortField,
  SortOrder,
  FolderListResponse,
  ReorderNotesRequest,
  TagListResponse,
} from "@derekentringer/shared/ns";
import { apiFetch } from "./client.ts";

export async function fetchNotes(params?: {
  folder?: string;
  search?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<NoteListResponse> {
  const qs = new URLSearchParams();
  if (params?.folder) qs.set("folder", params.folder);
  if (params?.search) qs.set("search", params.search);
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

export async function fetchFolders(): Promise<FolderListResponse> {
  const response = await apiFetch("/notes/folders");

  if (!response.ok) {
    throw new Error(`Failed to fetch folders: ${response.status}`);
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
  name: string,
  newName: string,
): Promise<{ updated: number }> {
  const response = await apiFetch(`/notes/folders/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify({ newName }),
  });

  if (!response.ok) {
    throw new Error(`Failed to rename folder: ${response.status}`);
  }

  return response.json();
}

export async function deleteFolderApi(
  name: string,
): Promise<{ updated: number }> {
  const response = await apiFetch(`/notes/folders/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete folder: ${response.status}`);
  }

  return response.json();
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
