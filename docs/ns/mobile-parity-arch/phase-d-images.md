# Phase D — Image Upload (mobile)

**Goal**: pick a photo from camera roll or take a new photo, upload
to Cloudflare R2, optionally AI-describe, insert into the note.
Mobile equivalent of desktop's drag-and-drop image flow.

## What desktop has

- Drag-and-drop or paste an image into the editor
- Image uploads to R2 via `/images/upload` (multipart, MIME +
  magic-byte validation, 10MB limit)
- AI description generated fire-and-forget by `analyzeImage` (Claude
  vision) → stored in `images.aiDescription` for AI chat / search
- Image renders inline in markdown with R2 public URL
- Image gallery view for a note
- Soft-delete via `DELETE /images/:imageId`

## What mobile needs

`expo-image-picker` covers both **camera roll** and **camera
capture**. Add to `MarkdownToolbar.tsx`:

- "Image" button → bottom sheet with two options:
  - "Choose from Library" → `expo-image-picker` library mode
  - "Take Photo" → camera mode
- Optional third: "Scan Document" → camera with edge-detection
  cropping (use `expo-camera` + `react-native-image-crop-picker`
  or punt to a later phase)

After selection:
1. Resize / compress client-side via `expo-image-manipulator` (cap
   long edge at 2048px, JPEG quality 85) to stay under the 10MB
   limit and save bandwidth
2. Upload via `/images/upload` (existing endpoint)
3. Insert `![](public-url)` at the cursor position
4. Backend kicks off AI description fire-and-forget (existing)

## Implementation outline

### 1. Image picker UX

```
┌──────────────────────────────────┐
│  Insert Image                    │
│                                  │
│  📷  Take Photo                  │
│  🖼️  Choose from Library         │
│                                  │
│  [Cancel]                        │
└──────────────────────────────────┘
```

Long-press image inside the editor (rendered preview) → action
sheet with "Replace", "Remove", "Copy URL".

### 2. Upload pipeline

New `packages/ns-mobile/src/api/images.ts`:

- `uploadImage(uri, noteId)` — reads the file via `expo-file-system`,
  builds a multipart form, posts to `/images/upload` with auth
  header
- Returns `{id, publicUrl, aiDescription?}`
- Inserts `![](publicUrl)` at the editor's selection

### 3. Offline upload queue

Mobile is offline-first; the upload should respect that:

- If online → upload immediately
- If offline → save the local file URI + a placeholder `image_id`
  in a `pending_uploads` SQLite table
- On reconnect → flush queue, swap placeholders for real R2 URLs in
  affected notes, push the note edits

This mirrors desktop's offline-image-upload-queue from the sync
engine. Reuse the same shape.

### 4. Display rendering

`react-native-markdown-display` (already in stack) renders inline
images via the `Image` component. Pass an `images` prop with a
local-cache lookup so the renderer can show offline placeholders
for pending uploads.

### 5. Image gallery

Tap-and-hold a markdown image in the rendered note → open a full-
screen viewer (use `react-native-image-viewing` or similar). Pinch
zoom, swipe between images, share.

### 6. Permissions

`expo-image-picker` and `expo-camera` both require runtime
permissions on iOS (`NSPhotoLibraryUsageDescription`,
`NSCameraUsageDescription`). Wire the rationale strings into
`app.json`.

## Done criteria

- User picks an image from library → uploads → renders inline in
  note within ~3s on a fast connection
- User takes a photo → uploads → renders
- Image survives note save/load round trip; markdown contains R2 URL
- Offline pick → image queued, uploads on reconnect, note re-edited
  to swap placeholder
- AI description appears in `notes.images.aiDescription` (visible
  via the AI chat's image-context search) within a few seconds
  after upload
- Soft-delete via long-press → "Remove image" works

## Out of scope

- Multi-image upload in one action (defer; ship with single-image
  first)
- Document scan with auto-cropping (separate phase if there's demand)
- Image annotation (draw / arrow / highlight) — out of scope for v1
- Image search by AI description on mobile UI — already works via
  AI chat; standalone search UI is a follow-up

## Risks / open questions

- **Large image memory pressure.** A 12MP photo at 4032×3024 needs
  resize before upload or RN can OOM mid-base64. `expo-image-
  manipulator` with `resize` should always run first.
- **Cellular data usage.** Auto-uploading photos over cellular is a
  data hog. A "Wi-Fi only" toggle in settings would be nice;
  default to Wi-Fi-only on first run.
- **R2 public URL caching.** Mobile should cache the R2-hosted
  images locally via `expo-file-system` so a re-render doesn't
  re-fetch every time.
- **Deleted images on other devices.** If desktop deletes an image
  via soft-delete, mobile's local note still has the markdown
  reference to a now-404 URL. Need a sync path that swaps deleted
  image markdown to a "deleted image" placeholder. May defer to a
  cleanup pass.
