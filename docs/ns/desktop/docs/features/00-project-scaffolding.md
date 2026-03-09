# 00 — Project Scaffolding

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Set up the Tauri v2 + React desktop app shell with SQLite local database, integrate into the existing `derekentringer-com` Turborepo monorepo, and establish dev tooling.

## What Was Implemented

### NoteSync Shared Types (`packages/ns-shared/`)
- New `@derekentringer/ns-shared` workspace package with all NoteSync-specific types
- Types extracted from `packages/shared/src/ns/types.ts`: `Note`, `CreateNoteRequest`, `UpdateNoteRequest`, `NoteListResponse`, `FolderInfo`, `TagInfo`, `SyncChange`, `SyncCursor`, `NoteVersion`, `EmbeddingStatus`, `AudioMode`, `TranscribeResponse`, `BacklinkInfo`, and more (179 lines)
- `@derekentringer/shared` re-exports from `ns-shared` for backward compatibility — existing ns-web and ns-api imports continue to work unchanged
- TypeScript build with `tsconfig.base.json` extension

### NoteSync Desktop Frontend (`packages/ns-desktop/`)
- React + Vite SPA on port 3006 (`strictPort: true` for Tauri)
- Tailwind CSS v4 with identical theme to ns-web (dark/light/system, lime-yellow accent `#d4e157`)
- Basic app shell with NoteSync logo and branding
- `@` path alias for imports
- `vite-env.d.ts` for Vite types
- Tauri env prefix configuration (`VITE_`, `TAURI_`)

### Tauri Backend (`packages/ns-desktop/src-tauri/`)
- Tauri v2 with Rust backend (rustc 1.94.0)
- App identifier: `com.derekentringer.notesync`
- Window: 1200×800 default, 800×600 minimum
- `tauri-plugin-sql` with SQLite feature for local database
- `tauri-plugin-log` for debug logging
- SQL plugin capability registered in `capabilities/default.json`
- Dev command: `npm run vite:dev` (Vite frontend)
- Build command: `npm run vite:build` (production build)

### SQLite Database (Initial Migration)
- `notes` table: id, title, content, folder_id, is_deleted (soft delete), created_at, updated_at
- `sync_queue` table: id, action, note_id, payload, created_at — queues pending sync changes
- `sync_meta` table: key-value store for sync state (e.g., last sync cursor)
- Migration loaded via `include_str!` in Rust and applied on first launch

### Monorepo Integration
- Both `ns-shared` and `ns-desktop` covered by existing `packages/*` workspace glob
- Turbo pipelines (build, dev, type-check) work without turbo.json modifications
- `.gitignore` updated for Tauri build artifacts (`src-tauri/target/`, `src-tauri/gen/`)
- `npm install` resolves all workspace dependencies

### Dev Workflow
- `npm run dev` (in ns-desktop) runs `tauri dev` — starts Vite dev server + Tauri native shell
- `npm run build` runs `tauri build` — produces native binary (`.dmg` on macOS)
- `npm run type-check` runs `tsc --noEmit`
- Dev port 3006 avoids conflicts with existing services (web :3000, fin-web :3003, ns-web :3005)

## Resolved Open Questions

- **Shared types**: Created dedicated `packages/ns-shared/` package with backward-compatible re-export through `@derekentringer/shared`
- **Tauri plugin versions**: tauri-plugin-sql v2 with SQLite feature, tauri-plugin-log v2
- **Component sharing**: ns-desktop uses same Tailwind theme and CSS as ns-web; React components will be shared/reused as features are built
