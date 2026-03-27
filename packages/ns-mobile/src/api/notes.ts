import type {
  Note,
  NoteListResponse,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteSortField,
  SortOrder,
  BacklinksResponse,
  NoteVersionListResponse,
} from "@derekentringer/ns-shared";
import api from "@/services/api";

export async function fetchNotes(params?: {
  folderId?: string;
  tags?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<NoteListResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.folderId) queryParams.folderId = params.folderId;
  if (params?.tags && params.tags.length > 0)
    queryParams.tags = params.tags.join(",");
  if (params?.search) queryParams.search = params.search;
  if (params?.page !== undefined) queryParams.page = String(params.page);
  if (params?.pageSize !== undefined)
    queryParams.pageSize = String(params.pageSize);
  if (params?.sortBy) queryParams.sortBy = params.sortBy;
  if (params?.sortOrder) queryParams.sortOrder = params.sortOrder;

  const { data } = await api.get<NoteListResponse>("/notes", {
    params: queryParams,
  });
  return data;
}

export async function fetchNote(id: string): Promise<Note> {
  const { data } = await api.get<{ note: Note }>(`/notes/${id}`);
  return data.note;
}

export async function fetchDashboard(): Promise<{
  recentlyEdited: Note[];
  favorites: Note[];
  audioNotes: Note[];
}> {
  const { data } = await api.get<{
    recentlyEdited: Note[];
    favorites: Note[];
    audioNotes: Note[];
  }>("/notes/dashboard");
  return data;
}

export async function fetchFavorites(params?: {
  sortBy?: NoteSortField;
  sortOrder?: SortOrder;
}): Promise<{ notes: Note[] }> {
  const queryParams: Record<string, string> = {};
  if (params?.sortBy) queryParams.sortBy = params.sortBy;
  if (params?.sortOrder) queryParams.sortOrder = params.sortOrder;

  const { data } = await api.get<{ notes: Note[] }>("/notes/favorites", {
    params: queryParams,
  });
  return data;
}

export async function createNote(body: CreateNoteRequest): Promise<Note> {
  const { data } = await api.post<{ note: Note }>("/notes", body);
  return data.note;
}

export async function updateNote(
  id: string,
  body: UpdateNoteRequest,
): Promise<Note> {
  const { data } = await api.patch<{ note: Note }>(`/notes/${id}`, body);
  return data.note;
}

export async function deleteNote(id: string): Promise<void> {
  await api.delete(`/notes/${id}`);
}

export async function fetchBacklinks(noteId: string): Promise<BacklinksResponse> {
  const { data } = await api.get<BacklinksResponse>(
    `/notes/${noteId}/backlinks`,
  );
  return data;
}

export async function fetchVersions(
  noteId: string,
  params?: { page?: number; pageSize?: number },
): Promise<NoteVersionListResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.page !== undefined) queryParams.page = String(params.page);
  if (params?.pageSize !== undefined)
    queryParams.pageSize = String(params.pageSize);

  const { data } = await api.get<NoteVersionListResponse>(
    `/notes/${noteId}/versions`,
    { params: queryParams },
  );
  return data;
}

export async function restoreVersion(
  noteId: string,
  versionId: string,
): Promise<Note> {
  const { data } = await api.post<{ note: Note }>(
    `/notes/${noteId}/versions/${versionId}/restore`,
  );
  return data.note;
}

export async function fetchTags(): Promise<{
  tags: { name: string; count: number }[];
}> {
  const { data } = await api.get<{
    tags: { name: string; count: number }[];
  }>("/notes/tags");
  return data;
}
