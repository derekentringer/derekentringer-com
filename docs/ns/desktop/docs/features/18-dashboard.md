# 18 — Dashboard (Empty Editor State)

## Summary

Replace the empty editor panel ("Select a note or create a new one") with a rich dashboard that displays when no note is selected. Provides quick access to common actions and surfaces relevant notes. Mirrors the ns-web dashboard implementation.

## What Was Built

### SQLite Migration
- Migration 010: Added `audio_mode TEXT` column to notes table

### Database Changes (`db.ts`)
- Added `audio_mode` to `NoteRow` interface and `rowToNote()` mapper
- Updated `upsertNoteFromRemote()` to handle `audio_mode` in UPDATE and INSERT
- Added `fetchRecentlyEditedNotes(limit)` — top N notes by `updated_at DESC`
- Added `fetchAudioNotes(limit)` — top N notes where `audio_mode IS NOT NULL`

### Rust Changes (`lib.rs`)
- Registered migration version 10 in `get_migrations()`
- Added `force_legacy_scrollbars()` — sets `AppleShowScrollBars = Always` via NSUserDefaults using `objc2-foundation` to force macOS legacy scrollbars that respect CSS `::-webkit-scrollbar` styling

### New Components
- **`Dashboard.tsx`** — Main dashboard with local SQLite data fetching via `Promise.all`
  - Quick Actions: New Note, New Recording, Import File
  - Resume Editing: Hero card for most recently edited note
  - Favorites, Recently Edited, Audio Notes: Horizontal scroll sections
- **`DashboardNoteCard.tsx`** — Card with default/hero variants (mirrors web)
- **`DashboardSection.tsx`** — Section wrapper with horizontal scroll

### NotesPage Integration
- Dashboard renders when no note is selected (non-trash view)
- `onSelectNote` fetches note by ID from local SQLite
- `onStartRecording` triggers sidebar AudioRecorder via DOM selector
- `onImportFile` triggers import button via DOM selector
- Title and summary containers use `overflow-hidden` to prevent scrollbar jitter

### Scrollbar Styling
- All scrollbars fade in/out on hover via CSS `@property --scroll-thumb-color` with `inherits: true` and 0.3s ease transition
- macOS legacy scrollbar mode forced via Rust NSUserDefaults to prevent overlay scrollbar takeover
- Removed `scrollbar-width`/`scrollbar-color` standard properties that conflict with `::-webkit-scrollbar`
- Sidebar panels use `overflow-x-hidden` to prevent horizontal scrolling

### Dependencies
- Added `objc2-foundation` v0.3 (macOS-only) for NSUserDefaults access

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/migrations/010.sql` | New SQLite migration for audio_mode |
| `src-tauri/src/lib.rs` | Migration 10 registration, force_legacy_scrollbars() |
| `src-tauri/Cargo.toml` | Added objc2-foundation macOS dependency |
| `src/lib/db.ts` | NoteRow, rowToNote, upsert, new queries |
| `src/components/Dashboard.tsx` | New |
| `src/components/DashboardNoteCard.tsx` | New |
| `src/components/DashboardSection.tsx` | New |
| `src/pages/NotesPage.tsx` | Replace empty state, overflow fixes |
| `src/styles/global.css` | Scrollbar fade animation, legacy scrollbar CSS |

## Tests

- Dashboard.test.tsx (8 tests), DashboardNoteCard.test.tsx (6 tests)
- Updated TrashView.test.tsx, NoteList.test.tsx, FavoritesPanel.test.tsx, syncDb.test.ts, db.test.ts with audioMode mock data
- Fixed TrashView.test.tsx missing db.ts mock exports (14 functions)
