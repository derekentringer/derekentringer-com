import { apiFetch } from "./client.ts";

export async function uploadImage(
  noteId: string,
  file: File,
  altText?: string,
): Promise<{ id: string; r2Url: string; altText: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("noteId", noteId);
  if (altText) form.append("altText", altText);

  const response = await apiFetch("/images/upload", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Upload failed" }));
    throw new Error(err.message || `Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function deleteImage(imageId: string): Promise<void> {
  const response = await apiFetch(`/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete image: ${response.status}`);
  }
}
