// Phase E.5 — image share upload pipeline.
//
// Mirrors the image flow used by `NoteEditorScreen` for in-editor
// inserts: resize the source image to a 2048-px long edge JPEG
// (so a 12 MP photo lands under ~1 MB before transit), then upload
// via the native multipart streamer. Server-side `analyzeImage`
// fires off the Claude vision description fire-and-forget; the
// receiver UI doesn't wait for it.

import * as ImageManipulator from "expo-image-manipulator";
import { uploadImage } from "@/api/images";

const LONG_EDGE_PX = 2048;
const JPEG_QUALITY = 0.85;

export interface UploadShareImageArgs {
  /** Local file:// URI from the share intent. */
  sourceUri: string;
  /** Note that should own this image record server-side. */
  noteId: string;
  /** Optional alt text — passed through to `/images/upload`. */
  altText?: string;
}

export interface UploadShareImageResult {
  r2Url: string;
}

/**
 * Resize the share-intent image to a sane upload size and stream it
 * to `/images/upload`. Returns the R2 public URL the receiver can
 * embed in the note's markdown.
 *
 * Resize uses `ImageManipulator` with no rotation/crop — we only
 * shrink. The output is always JPEG so the server-side magic-byte
 * validator and the Claude vision endpoint don't have to special-
 * case PNG/HEIC. The original `mimeType` from the intent is
 * intentionally ignored; the resize re-encodes either way.
 */
export async function uploadSharedImage(
  args: UploadShareImageArgs,
): Promise<UploadShareImageResult> {
  const resized = await ImageManipulator.manipulateAsync(
    args.sourceUri,
    [{ resize: { width: LONG_EDGE_PX } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  const uploaded = await uploadImage({
    uri: resized.uri,
    noteId: args.noteId,
    mimeType: "image/jpeg",
    altText: args.altText,
  });
  return { r2Url: uploaded.r2Url };
}

/**
 * Strip the extension from a filename for use as a derived note
 * title. `IMG_1234.jpg` → `IMG_1234`; `Screenshot 2026-05-08.png` →
 * `Screenshot 2026-05-08`. Returns the trimmed filename so the
 * caller can fall back to "Shared image" when the result is empty.
 */
export function deriveImageTitle(filename: string | undefined): string {
  if (!filename) return "Shared image";
  const trimmed = filename.trim();
  if (trimmed.length === 0) return "Shared image";
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0) return trimmed;
  const stem = trimmed.slice(0, dotIndex);
  return stem.length > 0 ? stem : trimmed;
}
