// Phase D — Image upload client.
//
// Mobile uploads via expo-file-system's native multipart streamer
// (the same path the audio pipeline uses) instead of axios +
// FormData. RN's JS-side FormData polyfill chokes on multi-MB
// bodies — the request leaves axios with a "Network Error" before
// it ever reaches the server. The native uploader streams the file
// directly from disk, so a 12MP photo uploads cleanly.
//
// Server contract (`/images/upload`, multipart):
//   - field `file` — the binary
//   - field `noteId` — required, string
//   - field `altText` — optional, string
// Returns `{ id, r2Url, altText }`.

import * as FileSystem from "expo-file-system/legacy";
import api, { tokenManager } from "@/services/api";

const API_BASE_URL = __DEV__
  ? "http://localhost:3004"
  : "https://ns-api.derekentringer.com";

export interface UploadedImage {
  id: string;
  r2Url: string;
  altText?: string;
}

export interface ImageRecord {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  r2Url: string;
  altText: string | null;
  aiDescription: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/** Upload a local image file (file:// URI) to R2 via the
 *  /images/upload endpoint. Caller passes the resized JPEG produced
 *  by `expo-image-manipulator`; this function does no resize of
 *  its own. */
export async function uploadImage(args: {
  uri: string;
  noteId: string;
  mimeType: string;
  altText?: string;
}): Promise<UploadedImage> {
  const accessToken = tokenManager.getAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const parameters: Record<string, string> = { noteId: args.noteId };
  if (args.altText) parameters.altText = args.altText;

  const result = await FileSystem.uploadAsync(
    `${API_BASE_URL}/images/upload`,
    args.uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType: args.mimeType,
      parameters,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Client-Type": "mobile",
      },
    },
  );

  if (result.status < 200 || result.status >= 300) {
    let serverMessage: string | undefined;
    try {
      const parsed = JSON.parse(result.body) as { message?: string };
      serverMessage = parsed.message;
    } catch {
      /* body wasn't JSON */
    }
    throw new Error(serverMessage ?? `Upload failed: HTTP ${result.status}`);
  }

  return JSON.parse(result.body) as UploadedImage;
}

/** Soft-delete an image on the server. The server marks
 *  `deleted_at` and the next sync pull propagates the deletion to
 *  every other device. */
export async function deleteImage(imageId: string): Promise<void> {
  await api.delete(`/images/${imageId}`);
}

/** Fetch the list of images attached to a note. Used by the image
 *  gallery view + the renderer's source resolver to look up R2 URLs
 *  by image-id when only the markdown reference is in the source
 *  text. */
export async function listImagesForNote(noteId: string): Promise<ImageRecord[]> {
  const response = await api.get<{ images: ImageRecord[] }>(
    `/images/note/${noteId}`,
  );
  return response.data.images ?? [];
}
