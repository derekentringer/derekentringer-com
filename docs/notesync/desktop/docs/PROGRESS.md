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
| AI | Anthropic Claude API (via notesync-api) | Tagging, summarization, semantic search, Q&A, inline markdown completions |
| Google Drive | Google Drive REST API | One-time .txt file import |
| Monorepo | Turborepo (existing) | `packages/notesync-desktop` in `derekentringer-com` monorepo |
| Language | TypeScript | Everywhere |

## Architecture Decisions

- **Tauri over Electron** — ~5MB bundle vs ~150MB; native performance; Rust backend for file system and SQLite access
- **Offline-first** — SQLite holds a full local copy of all notes; app is fully functional without internet
- **Sync engine** — background sync between local SQLite and central PostgreSQL via notesync-api; pending change queue with last-write-wins conflict resolution based on `updatedAt` timestamps
- **One-time .txt import** — migration wizard scans a local folder, previews files, imports into local SQLite, then syncs to central DB; no ongoing file watching
- **Google Drive import is one-time** — OAuth, pick a folder, import .txt files into local SQLite, done; not a live sync
- **CodeMirror 6 for markdown editing** — source editing with syntax highlighting, optional split-pane preview; no WYSIWYG
- **Custom AI editor extension** — `@derekentringer/codemirror-ai-markdown` is a standalone, backend-agnostic CodeMirror 6 extension; publishable to npm if desired; NoteSync wires it to Claude via notesync-api
- **AI calls go through notesync-api** — desktop never calls Claude directly; all AI requests route through the Fastify API
- **No code signing** — personal tool; users dismiss one-time OS warnings on first launch
- **Notes stored as markdown** — raw markdown in the database; editor shows source with syntax highlighting

## Phases

### Phase 1: Foundation — High Priority

- [ ] [00 — Project Scaffolding](feature_planning/00-project-scaffolding.md)

### Phase 2: Notes Core — High Priority

- [ ] [01 — .txt Import](feature_planning/01-txt-import.md)
- [ ] [02 — Note Editor](feature_planning/02-note-editor.md)

### Phase 3: Organization — High Priority

- [ ] [03 — Search & Organization](feature_planning/03-search-and-organization.md)

### Phase 4: External Sources & Sync — Medium Priority

- [ ] [04 — Google Drive Import](feature_planning/04-google-drive-import.md)
- [ ] [05 — Sync Engine](feature_planning/05-sync-engine.md)

### Phase 5: AI — Medium Priority

- [ ] [06 — AI Features](feature_planning/06-ai-features.md)

### Phase 6: Polish — Low Priority

- [ ] [07 — Settings & Preferences](feature_planning/07-settings-and-preferences.md)

## Extension Ideas (Future)

- Note linking / backlinks with graph visualization
- Note templates (meeting notes, journal, project plan)
- Version history (DB revisions with diff view)
- Clipboard capture via system hotkey
- OCR import using AI vision
- Browser extension for web clipping
- PDF / Markdown / HTML export
- Encrypted notes (end-to-end encryption)
- Kanban board view

## Status Key

- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Complete

## Workflow

1. Feature docs live in `feature_planning/` while in backlog or in-progress
2. When a feature is fully implemented, move its doc to `features/`
3. Update the checkbox and link path in this file
