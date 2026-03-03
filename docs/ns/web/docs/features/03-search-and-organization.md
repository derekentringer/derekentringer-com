# 03 — Search & Organization

**Status:** Complete
**Phase:** 2 — Notes Core
**Priority:** High

## Summary

Full-text search across all notes using PostgreSQL tsvector, plus a folder and tag system with drag-and-drop reorganization and sort/filter capabilities. Implemented incrementally across three sub-releases.

## Incremental Releases

| Release | Branch | Summary | Status |
|---------|--------|---------|--------|
| **03a** | `feature/ns-03a-trash-sort` | Trash view (list/restore/permanent delete), sort controls, auto-purge | Complete |
| **03b** | `feature/ns-03b-folders-dnd` | Flat folders, folder CRUD, @dnd-kit drag-and-drop reordering | Complete |
| **03c** | `feature/ns-03c-tags-fts` | Tag browser, tag CRUD, PostgreSQL tsvector full-text search with snippets, resizable sidebar, logo/branding, favicon | Complete |

Each release includes: API changes, frontend changes, shared type updates, tests, and doc updates.

---

## Release 03a: Trash View + Sort

**No schema migration needed** — `deletedAt` column already exists.

### API Changes
- Modify `listNotes`: add `sortBy` (title|createdAt|updatedAt) and `sortOrder` (asc|desc) params, default `updatedAt desc`
- `listTrashedNotes(filter?)` — where `deletedAt IS NOT NULL`, paginated, default sort by `deletedAt desc`
- `restoreNote(id)` — set `deletedAt` back to null
- `permanentDeleteNote(id)` — hard delete (must be in trash)
- `purgeOldTrash(days=30)` — `deleteMany` where `deletedAt < cutoff`

### Routes
- `GET /notes/trash` → 200 `{ notes, total }`
- `PATCH /notes/:id/restore` → 200 `{ note }`
- `DELETE /notes/:id/permanent` → 204
- Modify `GET /notes` → add `sortBy`, `sortOrder` query params

### Frontend
- Sort controls (field dropdown + direction toggle) between search and note list
- Trash button in sidebar footer with count badge
- Trash view: list deleted notes, read-only preview, Restore + Delete Permanently buttons
- "Back to notes" link when in trash view

---

## Release 03b: Flat Folders + Drag-and-Drop

**Prisma migration needed** — add `sortOrder` field.

### Schema Changes
- Add `sortOrder Int @default(0)` to Note model
- Add `@@index([sortOrder])`

### API Changes
- `listFolders()` — `groupBy` on folder, return names + counts
- `reorderNotes(order[])` — batch `$transaction` update
- `renameFolder(old, new)` — `updateMany` all notes in folder
- `deleteFolder(name)` — `updateMany` set folder to null
- Auto-assign `sortOrder` on create (max + 1)
- Add `sortOrder` as valid sort field

### Frontend
- FolderList component in sidebar with create, rename, delete
- NoteList component with @dnd-kit drag-and-drop reordering
- Drag-to-folder support
- activeFolder state for filtering

---

## Release 03c: Tags + Full-Text Search (tsvector)

**Prisma migration needed** — add tsvector column + trigger + GIN index.

### Schema Changes
- Add `search_vector tsvector` column (managed by trigger, not in Prisma schema)
- GIN index on `search_vector`
- Auto-update trigger on title/content changes

### API Changes
- `listTags()` — raw SQL: `jsonb_array_elements_text(tags)` with GROUP BY + COUNT
- `renameTag(old, new)` — batch update via `$transaction`
- `removeTag(name)` — batch remove via `$transaction`
- Full-text search: switch to raw SQL with `plainto_tsquery`, `ts_rank`, `ts_headline`
- Tag filtering: JSONB `@>` containment (AND logic)

### Frontend
- TagBrowser component in sidebar with counts, click to filter, rename/delete
- TagInput component below title with type-ahead autocomplete
- SearchSnippet component for `ts_headline` HTML in search results

---

## Technical Considerations

- Route ordering: Static routes (`/trash`, `/folders`, `/tags`, `/reorder`) MUST be registered before `/:id`
- Local DB migrations: `prisma migrate dev` doesn't work locally — run SQL manually via `psql`
- tsvector is invisible to Prisma — managed entirely by trigger + raw queries
- Tags stored as JSON array in the `tags` column; GIN index for efficient tag queries
- Drag-and-drop via `@dnd-kit`

## Dependencies

- [00 — Project Scaffolding](../features/00-project-scaffolding.md) — needs PostgreSQL database
- [01 — Auth](../features/01-auth.md) — all endpoints require authentication
- [02 — Note Management](../features/02-note-management.md) — needs notes to exist
