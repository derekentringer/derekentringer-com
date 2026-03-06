# 08 — Version History

## Overview

Captures snapshots of notes on save and lets users browse, diff, and restore past versions. The version history UI shares the existing right-side sliding drawer with the AI Assistant chat via stacked tab buttons.

## Database

- **NoteVersion model** in `ns-api/prisma/schema.prisma` — `id`, `noteId`, `title`, `content`, `createdAt`
- Cascade delete from Note (versions auto-deleted when note is deleted)
- Composite index on `(noteId, createdAt DESC)` for newest-first listing

## Backend

### Version Store (`ns-api/src/store/versionStore.ts`)

- `captureVersion(noteId, title, content)` — creates snapshot if elapsed time exceeds configurable interval (default 15 min); enforces 50-version cap per note by deleting oldest; interval of 0 skips cooldown check (captures every save)
- `listVersions(noteId, { page?, pageSize? })` — returns versions newest-first with total count
- `getVersion(versionId)` — returns single version or null

### Version Interval Setting (`ns-api/src/store/settingStore.ts`)

- `getVersionIntervalMinutes()` — returns configurable interval (default 15), stored as `versionIntervalMinutes` in Settings table
- `setVersionIntervalMinutes(minutes)` — persists interval setting

### Hook into Note Save

- After `createNote()` and `updateNote()` (when title or content changed): fire-and-forget `captureVersion()` call (same pattern as `syncNoteLinks`)

### Mapper (`ns-api/src/lib/mappers.ts`)

- `toNoteVersion(row)` — DateTime → ISO string conversion

### API Routes (`ns-api/src/routes/notes.ts`)

- `GET /notes/versions/interval` — returns current capture interval `{ minutes }`
- `PUT /notes/versions/interval` — sets capture interval (integer 0–60) `{ minutes }`
- `GET /notes/:id/versions` — list versions with pagination
- `GET /notes/:id/versions/:versionId` — get single version, validates it belongs to note
- `POST /notes/:id/versions/:versionId/restore` — updates note with version's title+content via `updateNote()`

## Shared Types (`shared/src/ns/types.ts`)

- `NoteVersion` — `{ id, noteId, title, content, createdAt }`
- `NoteVersionListResponse` — `{ versions: NoteVersion[], total: number }`

## Frontend

### API Client (`ns-web/src/api/notes.ts`)

- `fetchVersions(noteId, params?)` → `NoteVersionListResponse`
- `fetchVersion(noteId, versionId)` → `NoteVersion`
- `restoreVersion(noteId, versionId)` → `Note`
- `getVersionInterval()` → `{ minutes }`
- `setVersionInterval(minutes)` → `{ minutes }`

### Diff Utility (`ns-web/src/lib/diff.ts`)

- `diffLines(oldText, newText): DiffLine[]` — lightweight LCS-based line diff, no external dependencies

### VersionHistoryPanel (`ns-web/src/components/VersionHistoryPanel.tsx`)

- Side panel showing timestamped version list with relative time formatting
- Clicking a version sets it as selected; selected version highlighted
- Empty state: "No versions yet"

### DiffView (`ns-web/src/components/DiffView.tsx`)

- Replaces editor when viewing a version
- Header layout: Unified/Split toggle, Restore button, Close button on left; version date/time on right
- Unified view: full-width +/- lines with green/red backgrounds
- Split view: two columns (Version / Current) with matched lines
- Title diff shown at top when title changed
- "Restore this version" button with two-step confirm; success toast auto-dismisses after 3s
- "Close" button to return to editor

### Tabbed Drawer Integration (`ns-web/src/pages/NotesPage.tsx`)

- Two stacked tab buttons positioned above backlinks panel on left edge of drawer:
  - Top: chat icon (AI Assistant) — shown when AI is enabled
  - Bottom: clock icon (Version History) — shown when a note is selected
- Clicking inactive tab opens drawer to that content
- Clicking active tab closes drawer
- Drawer content switches between QAPanel and VersionHistoryPanel
- Drawer is horizontally resizable via `useResizable` with `invert: true` and `ResizeDivider` on left edge; width persists to localStorage
- Version selection/close/restore clears diff view and returns to editor

### Version Interval Setting (`ns-web/src/pages/SettingsPage.tsx`)

- "Version History" section card between Trash and Keyboard Shortcuts
- Capture interval dropdown: Every save (0), 5 min, 15 min (default), 30 min, 60 min
- Optimistic update with revert on failure (same pattern as trash retention)

### Draggable Backlinks Panel (`ns-web/src/components/BacklinksPanel.tsx`)

- Vertically resizable via `useResizable` with `invert: true` (dragging top handle upward increases height)
- `ResizeDivider` shown at top when expanded; height persists to `ns-backlinks-height` in localStorage (default 150px, range 80–400px)
- Collapsed/expanded state persists to `ns-backlinks-collapsed` in localStorage

## Tests

### Backend (ns-api)

- `versionStore.test.ts` — captureVersion (create, cooldown skip, cap enforcement), listVersions, getVersion
- `notes.test.ts` — version route tests (list, get, restore, 400/401/404 cases)

### Frontend (ns-web)

- `diff.test.ts` — identical, added, removed, mixed, empty edge cases
- `VersionHistoryPanel.test.tsx` — version list, empty state, selected highlight, click handler, timestamp formatting
- `DiffView.test.tsx` — unified/split rendering, mode toggle, title diff, restore confirm, close handler

## Files Changed

| File | Action |
|------|--------|
| `ns-api/prisma/schema.prisma` | Modified — NoteVersion model + Note relation |
| `ns-api/prisma/migrations/20260306100000_add_note_versions/migration.sql` | Created |
| `ns-api/src/store/versionStore.ts` | Created — captureVersion with dynamic interval, listVersions, getVersion |
| `ns-api/src/store/settingStore.ts` | Modified — getVersionIntervalMinutes(), setVersionIntervalMinutes() |
| `ns-api/src/store/noteStore.ts` | Modified — captureVersion hooks |
| `ns-api/src/lib/mappers.ts` | Modified — toNoteVersion() |
| `ns-api/src/routes/notes.ts` | Modified — version endpoints + interval endpoints |
| `ns-api/src/__tests__/helpers/mockPrisma.ts` | Modified — noteVersion mock |
| `ns-api/src/__tests__/versionStore.test.ts` | Created — dynamic interval tests |
| `ns-api/src/__tests__/notes.test.ts` | Modified — version route + interval tests |
| `shared/src/ns/types.ts` | Modified — NoteVersion types |
| `ns-web/src/lib/diff.ts` | Created |
| `ns-web/src/hooks/useResizable.ts` | Modified — added `invert` option |
| `ns-web/src/api/notes.ts` | Modified — version + interval API functions |
| `ns-web/src/api/offlineNotes.ts` | Modified — re-exports |
| `ns-web/src/components/VersionHistoryPanel.tsx` | Created |
| `ns-web/src/components/DiffView.tsx` | Created — header layout with actions left, date right |
| `ns-web/src/components/BacklinksPanel.tsx` | Modified — draggable height + persisted collapsed state |
| `ns-web/src/components/QAPanel.tsx` | Modified — removed toggle button |
| `ns-web/src/pages/NotesPage.tsx` | Modified — tabbed drawer, resizable right panel, tab positioning |
| `ns-web/src/pages/SettingsPage.tsx` | Modified — Version History interval section |
| `ns-web/src/__tests__/diff.test.ts` | Created |
| `ns-web/src/__tests__/VersionHistoryPanel.test.tsx` | Created |
| `ns-web/src/__tests__/DiffView.test.tsx` | Created |
| `ns-web/src/__tests__/SettingsPage.test.tsx` | Modified — version interval mocks + tests |
| `ns-web/src/__tests__/NotesPage.test.tsx` | Modified — version mocks |
| `ns-web/src/__tests__/QAPanel.test.tsx` | Modified — removed onToggle prop |
