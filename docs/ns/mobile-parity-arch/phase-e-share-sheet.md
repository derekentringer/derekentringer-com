# Phase E — Share Sheet Integration (mobile)

**Goal**: receive text, URLs, and images from any other app via the
OS share sheet → save as a new note or append to an existing one.
This is mobile-native; no desktop equivalent. Closes the "I saw
something I want to remember" capture loop.

## Use cases

1. Reading a webpage → share to NoteSync → "Save URL + title to
   Reading List folder"
2. Twitter / X / Bluesky thread → share → "Save full text to
   Quotes folder"
3. Photo from Photos app → share → "Save with AI description to
   Visual Inbox folder"
4. Highlighted text in any app → share → "Append to my Daily Note"

## Implementation outline

### 1. Native share-extension targets

This is the bulk of the work. Each platform needs a small native
target:

- **Android**: an `ACTION_SEND` intent filter on the main activity
  receives shared content. Expo can do this via `app.json`'s
  `intentFilters` config, no native code needed.
  ```json
  {
    "android": {
      "intentFilters": [{
        "action": "android.intent.action.SEND",
        "data": [{ "mimeType": "text/plain" }, { "mimeType": "image/*" }],
        "category": ["android.intent.category.DEFAULT"]
      }]
    }
  }
  ```
- **iOS**: a separate Share Extension target in the Xcode project.
  Expo doesn't fully support custom share extensions in the
  managed workflow today — likely needs a config plugin or a
  small `react-native-share-menu` integration.

### 2. Share-receiver UI

When the user shares, a modal opens (instead of the full app):

```
┌──────────────────────────────────┐
│  Save to NoteSync                │
│                                  │
│  Source: [URL preview / text]    │
│                                  │
│  ○ New note                      │
│  ○ Append to: [pick a note]      │
│  ○ New note in folder: [picker]  │
│                                  │
│  Title: [auto-generated]         │
│  Tags:  [auto-suggest]           │
│                                  │
│  [Cancel]            [Save]      │
└──────────────────────────────────┘
```

After Save, the modal closes back to the originating app. Note
syncs in background.

### 3. URL handling

Shared URLs get auto-titled (a small fetch on save to grab `<title>`
+ `<meta description>`) so the saved note doesn't just say
"https://example.com". Defer to server side via a new
`/links/preview` endpoint, or do it client-side with a simple
regex on `<title>` tag.

### 4. Image handling

Shared images go through the same upload pipeline as Phase D
(picker + R2 upload + AI description). Reuses that work.

### 5. Append-to-note flow

Pick an existing note → user's shared content is appended at the
end of `content` with a separator (`\n\n---\n\n` + timestamp). Same
markdown shape on every device after sync.

### 6. Permissions / settings

- iOS: `NSPhotoLibraryUsageDescription` reused from Phase D
- Android: `READ_EXTERNAL_STORAGE` for older API levels
- Settings: "Show in share sheet" toggle (default on)

## Done criteria

- Share text from any app → saves a note titled from the first 50
  chars or AI-suggested title
- Share URL → saves a note with URL + page title + page description
- Share image → uploads + saves note with the markdown reference +
  AI description
- Append to note works (picker shows recent + favorites notes)
- Saved note appears on desktop / web after sync
- Modal dismisses cleanly back to the source app

## Out of scope

- Multi-item shares (e.g. multiple photos at once) — single-item v1
- Share OUT of NoteSync (sharing a note to another app) — that's
  the inverse direction; defer
- iOS-style "Save to Reading List" gesture — overkill

## Risks / open questions

- **iOS share extension complexity.** The bulk of phase cost. May
  need to eject from managed Expo workflow or use `expo-config-
  plugins` + a community share-extension plugin. A spike before
  committing is wise.
- **Cold-start latency.** Share extensions must launch fast. The
  receiver UI has to be available before the full app boots — the
  modal can't depend on the React Navigation tree being ready.
- **Auth in the extension.** The share extension needs access to
  the user's auth token. Use the shared keychain / shared
  expo-secure-store group so both the main app and the extension
  can read it.
- **URL preview caching.** A 500ms latency on URL save adds
  perceptible delay. Save the bare URL first, fetch the metadata
  in the background, swap it in via sync after.
