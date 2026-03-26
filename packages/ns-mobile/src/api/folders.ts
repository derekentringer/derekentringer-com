import type { FolderListResponse } from "@derekentringer/ns-shared";
import api from "@/services/api";

export async function fetchFolders(): Promise<FolderListResponse> {
  const { data } = await api.get<FolderListResponse>("/notes/folders");
  return data;
}

export async function createFolder(
  name: string,
  parentId?: string,
): Promise<{ id: string; name: string; parentId: string | null; sortOrder: number }> {
  const body: Record<string, string> = { name };
  if (parentId) body.parentId = parentId;

  const { data } = await api.post<{
    id: string;
    name: string;
    parentId: string | null;
    sortOrder: number;
  }>("/notes/folders", body);
  return data;
}

export async function renameFolder(
  folderId: string,
  newName: string,
): Promise<{ id: string; name: string }> {
  const { data } = await api.patch<{ id: string; name: string }>(
    `/notes/folders/${encodeURIComponent(folderId)}`,
    { newName },
  );
  return data;
}

export async function deleteFolder(
  folderId: string,
  mode: "move-up" | "recursive" = "move-up",
): Promise<{ updated: number }> {
  const { data } = await api.delete<{ updated: number }>(
    `/notes/folders/${encodeURIComponent(folderId)}?mode=${mode}`,
  );
  return data;
}
