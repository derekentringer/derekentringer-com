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
| Vector Search | SQLite JSON text + pure JS cosine similarity | Semantic search via locally stored embeddings (no sqlite-vec — Tauri SQL plugin can't load extensions) |
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

- [x] [07 — Settings & Preferences](features/07-settings-and-preferences.md) — Theme (dark/light/system), accent color (11 presets), editor font size, default view mode, line numbers, word wrap, auto-save delay, tab size, cursor style (line/block/underline), cursor blink toggle, trash retention, version capture interval, 2FA (TOTP setup/disable), keyboard shortcuts reference

### Phase 6: Auth & Sync — Medium Priority

- [x] [08 — Auth](features/08-auth.md)
- [x] [09 — Sync Engine](features/09-sync-engine.md) — SSE-based real-time sync with push/pull protocol and LWW conflict resolution, callback refs pattern to avoid stale closures in sync callbacks, `upsertNoteFromRemote` with LWW check (skip if local is newer), SSE reconnect race condition fix (captured local AbortController), notes/favorites sort persistence to localStorage with validation helpers, `reloadNotes` converted to `useCallback`, `handleSave` deps updated for correct re-fetch, dimmed green idle icon (`text-green-600/50`) on SyncStatusButton matching web app

### Phase 7: AI — Medium Priority

- [x] [10a — AI Features: Foundation](features/10a-ai-features-foundation.md) — Inline ghost text completions (SSE streaming) with completion styles (Continue/Markdown/Brief), note summarization (sparkle button → API → summary below title), smart auto-tagging (tag button → API → accept/dismiss pills), AI settings UI (master toggle, per-feature toggles, completion style radio group), ghost text CodeMirror extension (Tab accept, Escape dismiss, 600ms debounce), `useAiSettings` hook with localStorage persistence, save-before-AI-call pattern with local SQLite + sync
- [x] [10b — AI Features: Select-and-Rewrite](features/10b-ai-select-and-rewrite.md) — Select text + Cmd/Ctrl+Shift+R or right-click opens floating rewrite menu with 6 actions (Rewrite, Make concise, Fix grammar, Convert to list, Expand, Summarize), inline-styled tooltip with theme-aware colors, loading/error states with 2s auto-close, `rewriteText` API function, settings toggle + keyboard shortcuts, rewrite menu CSS moved to inline styles for both web and desktop
- [x] [10c — AI Features: Semantic Search](features/10c-ai-semantic-search.md) — Keyword/semantic/hybrid search modes with search mode dropdown, embeddings generated via ns-api Voyage AI and cached locally in SQLite as JSON text, pure JS cosine similarity (no sqlite-vec), background embedding processor with 22s rate limit, embedding status in Settings, new `POST /ai/embeddings/generate` backend endpoint, sync engine queues embeddings on pull, tag browser animation + blur fix + scrollable overflow on both web and desktop
- [x] [10d — AI Features: Audio Notes](features/10d-ai-audio-notes.md) — Audio recording via MediaRecorder API, transcription via ns-api Whisper endpoint, four modes (Meeting/Lecture/Memo/Verbatim), AudioRecorder component with timer + mode dropdown, note timestamps in editor toolbar status bar
- [x] [10e — AI Features: AI Assistant Chat](features/10e-ai-assistant-chat.md) — AI assistant chat panel in right-side drawer with streaming answers, citation pills, markdown rendering, source pill navigation; focus mode (Cmd/Ctrl+Shift+D) hides sidebar and drawer tabs; Cmd/Ctrl+S manual save; unified keyboard shortcuts across web and desktop Settings pages; Cmd/Ctrl+K focus search added to web
- [x] [10f — AI Features: Continue Writing](features/10f-ai-continue-writing.md) — Continue writing & structure suggestions (Cmd/Ctrl+Shift+Space), auto-selects paragraph style for long docs or structure style for short docs, settings toggle + keyboard shortcut reference

### Phase 8: External Sources — Low Priority

- [x] [11 — File Drag-and-Drop Import](features/11-file-drag-and-drop-import.md) — Drag `.md`/`.txt`/`.markdown` files into editor area to import as notes, visual drag overlay with dashed border, progress toast with animated bar, folder-aware imports preserving directory structure, `dragDropEnabled: false` in Tauri config to allow HTML5 drag events, import utilities (parse/filter/read/create), `openNoteAsTab` for post-import tab, 26 tests; also fixed web bug where drag-imported notes didn't open a tab

### UI Enhancements

- [x] Note timestamps in status bar — Created date and Modified date+time displayed in the toolbar status bar next to save status, separated by middle-dot (`·`) separators, with full date+time hover tooltips; `text-[11px] text-muted-foreground` styling matching save status
- [x] [14 — Import Button + Export](features/14-import-export.md) — ImportButton component with file/folder picker in sidebar footer, export notes as .md/.txt/.pdf via right-click context menu, export folders as .zip with preserved structure, jszip + marked dependencies, 33 tests

### Phase 11: Build & Distribution — Low Priority

- [x] [16 — Build & Distribution](features/16-build-and-distribution.md) — Environment-aware build scripts with `.env` / `.env.production` for local vs prod API switching, `tauri:build:prod` builds universal binary with prod URL baked in, `tauri:version-sync` reads latest git tag into `tauri.conf.json`

### Phase 9: Hardening — Low Priority

- [ ] [13 — Architecture Hardening](feature_planning/13-architecture-hardening.md)

### Phase 10: Local File Support — Low Priority

- [x] [15 — Local File Support](features/15-local-file-support.md) — Local file linking with bidirectional sync, import choice dialog (Import to NoteSync / Keep Local), three-write save (file + SQLite + sync), file watcher with write suppression + 30s poll backup, external change detection with dialog/auto-reload and hash dedup, missing file detection with red indicators (dot in note list, triangle on tab), local file diff view (unified/split), cross-device cloud_newer detection, delete choice dialog, unlink local file, web app indicator for local file notes, sync push rejection handling, folder unique index fix

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
