import type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListResponse,
} from "@derekentringer/shared/ns";
import { apiFetch } from "./client.ts";

export async function fetchNotes(params?: {
  folder?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<NoteListResponse> {
  const qs = new URLSearchParams();
  if (params?.folder) qs.set("folder", params.folder);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));

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
