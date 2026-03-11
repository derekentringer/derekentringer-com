# NoteSync Desktop App — Progress Tracker

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Desktop Shell | Tauri | Lightweight native wrapper; Mac + Windows + Linux |
| UI Framework | React + TypeScript | Shared patterns with web; rendered inside Tauri webview |
| Styling | Tailwind CSS | Consistent with web app |
| Markdown Editor | CodeMirror 6 | Syntax highlighting, extensible; shared with web |
| AI Editor Extension | @derekentringer/codemirror-ai-markdown | Custom publishable extension; ghost text completions + select-and-rewrite via Claude API |
| Local Database | SQLite (Tauri SQL plugin) | Full offline copy of all notes |
| Full-Text Search | SQLite FTS5 | Keyword search across all notes offline |
| Vector Search | sqlite-vec | Semantic search via locally stored embeddings |
| AI | Anthropic Claude API (via ns-api) | Tagging, summarization, semantic search, Q&A, inline markdown completions |
| Google Drive | Google Drive REST API | One-time .txt file import |
| Auth | JWT (via ns-api) | Shared accounts across web, desktop, and mobile |
| Monorepo | Turborepo (existing) | `packages/ns-desktop` in `derekentringer-com` monorepo |
| Language | TypeScript | Everywhere |

## Architecture Decisions

- **Tauri over Electron** — ~5MB bundle vs ~150MB; native performance; Rust backend for file system and SQLite access
- **Offline-first** — SQLite holds a full local copy of all notes; app is fully functional without internet
- **Login required** — authenticates against ns-api; shared accounts across web, desktop, and mobile; app needs connectivity for initial login, then works offline
- **Sync engine** — background sync between local SQLite and central PostgreSQL via ns-api; pending change queue with last-write-wins conflict resolution based on `updatedAt` timestamps
- **One-time .txt import** — migration wizard scans a local folder, previews files, imports into local SQLite, then syncs to central DB; no ongoing file watching
- **Google Drive import is one-time** — OAuth, pick a folder, import .txt files into local SQLite, done; not a live sync
- **CodeMirror 6 for markdown editing** — source editing with syntax highlighting, optional split-pane preview; no WYSIWYG
- **Custom AI editor extension** — `@derekentringer/codemirror-ai-markdown` is a standalone, backend-agnostic CodeMirror 6 extension; publishable to npm if desired; NoteSync wires it to Claude via ns-api
- **AI calls go through ns-api** — desktop never calls Claude directly; all AI requests route through the Fastify API
- **No code signing** — personal tool; users dismiss one-time OS warnings on first launch
- **Notes stored as markdown** — raw markdown in the database; editor shows source with syntax highlighting

## Phases

### Phase 1: Foundation — High Priority

- [x] [00 — Project Scaffolding](features/00-project-scaffolding.md)

### Phase 2: Notes Core — High Priority

- [x] [01 — Note Editor](features/01-note-editor.md)

### Phase 3: Organization — High Priority

- [x] [02 — Search & Organization](features/02-search-and-organization.md)

### Phase 4: UI Features — High Priority

- [x] [03 — Note Linking + Backlinks](features/03-note-linking.md)
- [x] [04 — Version History](features/04-version-history.md)
- [x] [05 — Favorites](features/05-favorites.md) — Favorite notes and folders via right-click context menus, collapsible Favorites panel with sort dropdown (Manual/Modified/Created/Title) and asc/desc toggle inline with header, drag-and-drop manual reordering via `@dnd-kit/sortable`, `favorite_sort_order` SQLite column (migration 007) with auto-assignment on favorite toggle, default sort Modified Descending, case-insensitive title sorting via `COLLATE NOCASE`, `handleSave` re-fetches notes and favorites for correct sort order
- [x] [06 — Editor Tabs](features/06-editor-tabs.md) — VS Code-style tab bar with permanent tabs (double-click), preview tabs (single-click always creates preview tab with italic title, auto-pin on edit), drag-and-drop reordering, middle-click close, trash view integration

- [x] Trash view UI polish — Removed redundant retention setting dropdown from trash sidebar (already in Settings page), sidebar footer (sync/settings/admin/signout) always visible regardless of view, trash button hidden when in trash view, preview pane empty state text matches web app

### Phase 5: Settings — Medium Priority

- [x] [07 — Settings & Preferences](features/07-settings-and-preferences.md)

### Phase 6: Auth & Sync — Medium Priority

- [x] [08 — Auth](features/08-auth.md)
- [x] [09 — Sync Engine](features/09-sync-engine.md) — SSE-based real-time sync with push/pull protocol and LWW conflict resolution, callback refs pattern to avoid stale closures in sync callbacks, `upsertNoteFromRemote` with LWW check (skip if local is newer), SSE reconnect race condition fix (captured local AbortController), notes/favorites sort persistence to localStorage with validation helpers, `reloadNotes` converted to `useCallback`, `handleSave` deps updated for correct re-fetch, dimmed green idle icon (`text-green-600/50`) on SyncStatusButton matching web app

### Phase 7: AI — Medium Priority

- [ ] [10 — AI Features](feature_planning/10-ai-features.md)

### Phase 8: External Sources — Low Priority

- [ ] [11 — File Import](feature_planning/11-txt-import.md)
- [ ] [12 — Google Drive Import](feature_planning/12-google-drive-import.md)
- [ ] [14 — Export](feature_planning/14-export.md)

### Phase 9: Hardening — Low Priority

- [ ] [13 — Architecture Hardening](feature_planning/13-architecture-hardening.md)

## Extension Ideas (Future)

- Note templates (meeting notes, journal, project plan)
- Clipboard capture via system hotkey
- OCR import using AI vision
- Browser extension for web clipping
- Encrypted notes (end-to-end encryption)
- Kanban board view
- Graph visualization for note links

## Status Key

- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Complete

## Workflow

1. Feature docs live in `feature_planning/` while in backlog or in-progress
2. When a feature is fully implemented, move its doc to `features/`
3. Update the checkbox and link path in this file
