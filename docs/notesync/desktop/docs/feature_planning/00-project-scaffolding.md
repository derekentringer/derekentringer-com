# 00 — Project Scaffolding

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Set up the Tauri + React desktop app shell with SQLite local database, integrate into the existing `derekentringer-com` Turborepo monorepo, and establish dev tooling.

## Requirements

- Create `packages/notesync-desktop/` in the existing monorepo
- Initialize Tauri project with React frontend
- Configure TypeScript with shared `tsconfig.base.json`
- Set up Tailwind CSS for styling
- Configure SQLite via Tauri SQL plugin for local database
- Create initial SQLite schema for notes:
  ```sql
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,       -- raw markdown
    folder TEXT,
    tags TEXT,                   -- JSON array
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    deletedAt TEXT,              -- soft delete
    syncStatus TEXT DEFAULT 'pending',  -- pending | synced | modified
    remoteId TEXT               -- ID from central PostgreSQL
  );
  ```
- Create initial SQLite schema for sync tracking:
  ```sql
  CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    noteId TEXT NOT NULL,
    action TEXT NOT NULL,        -- create | update | delete
    payload TEXT NOT NULL,       -- JSON of the change
    createdAt TEXT NOT NULL
  );

  CREATE TABLE sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  ```
- Set up Tauri commands for SQLite CRUD operations
- Basic app shell with sidebar navigation and main content area
- Configure ESLint and Prettier (shared config)
- Add `notesync-desktop` to `turbo.json` pipelines
- Health check: app launches, connects to SQLite, renders shell

## Technical Considerations

- Tauri uses Rust for the backend (file system, SQLite, native APIs) and a webview for the frontend (React)
- SQLite is accessed via Tauri's SQL plugin (`tauri-plugin-sql`) — no separate SQLite binary needed
- The React frontend is identical to a web app; Tauri wraps it in a native window
- Dev mode: `tauri dev` runs the React dev server + Tauri native shell simultaneously
- Build: `tauri build` produces `.dmg` (Mac) and `.exe` / `.msi` (Windows)
- Turborepo integration: add `notesync-desktop` to workspace, configure build/dev/lint tasks
- `packages/notesync-shared/` or extension of `@derekentringer/shared` will hold types shared across all NoteSync packages

## Dependencies

None — this is the first feature.

## Open Questions

- Should NoteSync-specific shared types live in a new `packages/notesync-shared/` package or extend the existing `@derekentringer/shared` with a `notesync` export path?
- Exact Tauri plugin versions for SQL and other native APIs?
- Should the desktop app share the same React component library as notesync-web, or keep them separate initially?
