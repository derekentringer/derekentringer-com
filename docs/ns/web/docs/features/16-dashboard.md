# 16 — Dashboard (Empty Editor State)

## Summary

Replace the empty editor panel ("Select a note or create a new one") with a rich dashboard that displays when no note is selected. Provides quick access to common actions and surfaces relevant notes.

## What Was Built

### Shared Type Changes (`ns-shared`)
- Added `audioMode: AudioMode | null` to `Note` interface for identifying audio notes
- Added `audioMode?: AudioMode` to `CreateNoteRequest`

### API Changes (`ns-api`)
- Added `audioMode String?` column to Prisma Note model with migration
- Added `getDashboardData(userId)` store function — 3 parallel Prisma queries (recently edited, favorites, audio notes) with 10-item limits
- Added `GET /notes/dashboard` authenticated endpoint returning `{ recentlyEdited, favorites, audioNotes }`
- Updated `toNote()` mapper to include `audioMode`
- Updated `createNote()` to persist `audioMode`
- Updated transcription endpoint to pass `audioMode` when creating notes

### Web API Client (`ns-web`)
- Added `fetchDashboardData()` API function

### New Components (`ns-web`)
- **`Dashboard.tsx`** — Main dashboard component with data fetching on mount
  - Quick Actions: New Note, New Recording (disabled if audio not enabled), Import File
  - Resume Editing: Hero card for most recently edited note
  - Favorites: Horizontal scroll row of favorite notes
  - Recently Edited: Horizontal scroll of recent notes (minus hero)
  - Audio Notes: Horizontal scroll, only shown when audio features enabled
- **`DashboardNoteCard.tsx`** — Card with `default` (220px) and `hero` (full-width) variants; shows title, stripped markdown preview, tags (max 3 + overflow count), folder name, relative date
- **`DashboardSection.tsx`** — Section wrapper with bold heading and horizontal scroll container

### NotesPage Integration (`ns-web`)
- Dashboard renders when no note is selected (non-trash view)
- `onSelectNote` fetches note by ID and opens it
- `onStartRecording` triggers sidebar AudioRecorder via DOM
- `onImportFile` triggers file input via DOM
- Dashboard refreshes via key prop when returning to empty state

### Scrollbar Styling
- Dashboard scroll sections use `dashboard-scroll` class with fade-in/fade-out scrollbar behavior via CSS `@property` animation
- Scrollbar thumb fades from transparent to themed color on hover with 0.3s ease transition

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-shared/src/types.ts` | Added `audioMode` to Note + CreateNoteRequest |
| `packages/ns-api/prisma/schema.prisma` | Added `audioMode` column |
| `packages/ns-api/prisma/migrations/20260313000000_add_audio_mode/migration.sql` | New migration |
| `packages/ns-api/src/store/noteStore.ts` | Updated NOTE_COLUMNS, createNote, added getDashboardData |
| `packages/ns-api/src/lib/mappers.ts` | Added audioMode to toNote() |
| `packages/ns-api/src/routes/notes.ts` | Added GET /notes/dashboard |
| `packages/ns-api/src/routes/ai.ts` | Pass audioMode to createNote |
| `packages/ns-web/src/api/notes.ts` | Added fetchDashboardData() |
| `packages/ns-web/src/components/Dashboard.tsx` | New |
| `packages/ns-web/src/components/DashboardNoteCard.tsx` | New |
| `packages/ns-web/src/components/DashboardSection.tsx` | New |
| `packages/ns-web/src/pages/NotesPage.tsx` | Replace empty state with Dashboard |
| `packages/ns-web/src/styles/global.css` | Scrollbar fade animation via @property |

## Tests

- `ns-api`: audioMode mapper tests, getDashboardData store tests, createNote assertion updates
- `ns-web`: Dashboard.test.tsx (8 tests), DashboardNoteCard.test.tsx (6 tests)
