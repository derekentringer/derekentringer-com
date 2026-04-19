# 26 — Frontmatter Support

**Status:** Planned
**Priority:** High
**Depends on:** None (foundational for 27–30)

## Summary

Add YAML frontmatter as the source of truth for note metadata. The frontmatter block lives inside the note content string. Database columns for metadata fields (tags, title, etc.) become a read cache derived from parsing the frontmatter. The API and editor read and write metadata by manipulating the frontmatter block in the content, then the database cache is updated to match.

This is foundational — features 27–30 (directory watching, external delete handling, rename detection, folder mirroring) all depend on notes being self-describing via frontmatter so that files on disk carry their own metadata.

## Design Principles

- **Frontmatter is source of truth** — if the frontmatter and database disagree, the frontmatter wins
- **Database is a read cache** — indexed for fast search/filtering, rebuilt from frontmatter on any content change
- **Standard fields follow conventions** — maximize compatibility with Obsidian, Jekyll, Hugo, and other Markdown tools
- **Unknown fields are preserved** — if a user imports an Obsidian file with `cssclasses` or plugin-specific keys, NoteSync preserves them on save
- **Empty notes get an empty frontmatter block** — every note has `---\n---\n` at minimum

## Frontmatter Schema

### Standard Fields (portable across tools)

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Note title |
| `date` | ISO 8601 string | Creation date (`"2026-04-16T10:30:00Z"`) |
| `updated` | ISO 8601 string | Last modified date |
| `tags` | YAML list | Tags, no `#` prefix |
| `description` | string | Note summary |
| `aliases` | YAML list | Alternative names for link resolution |

### NoteSync Fields (ignored by other tools)

| Field | Type | Description |
|-------|------|-------------|
| `favorite` | boolean | Favorited note |

### Database-Only Fields (not in frontmatter)

These are app-internal and do not belong in the file:

- `folderId` — folder assignment (structural, not content metadata)
- `sortOrder`, `favoriteSortOrder` — UI ordering
- `audioMode` — recording mode
- `isLocalFile`, `local_path`, `local_file_hash` — local file tracking
- `sync_status` — sync state
- `embedding` — vector data

## Example

```markdown
---
title: Q2 Meeting Notes
date: "2026-04-10T09:00:00Z"
updated: "2026-04-16T14:22:00Z"
tags:
  - work
  - meetings
description: Quarterly planning session notes
favorite: true
---

# Q2 Meeting Notes

The actual content starts here...
```

## Implementation

### Phase 1: Frontmatter Parser/Serializer

Create `packages/ns-shared/src/frontmatter.ts` (shared across web, desktop, API):

- `parseFrontmatter(content: string)` → `{ metadata: FrontmatterData, body: string, raw: string, unknownFields: Record<string, unknown> }`
- `serializeFrontmatter(metadata: FrontmatterData, body: string, unknownFields?: Record<string, unknown>)` → `string`
- `updateFrontmatterField(content: string, field: string, value: unknown)` → `string`
- `removeFrontmatterField(content: string, field: string)` → `string`
- Use a YAML 1.2 parser (`yaml` npm package) tolerant of YAML 1.1 idioms (`yes`/`no` as booleans, bare dates)
- Preserve field ordering and comments where possible
- Preserve unknown fields on round-trip

### Phase 2: API Integration

**ns-api changes:**
- When the API creates or updates a note, it manipulates the frontmatter in the content string rather than writing metadata to separate columns
- After writing, parse the frontmatter and update database cache columns (tags, title, etc.)
- Add a `syncFrontmatterCache(noteId)` function that re-derives cache columns from content
- API endpoints that update tags, title, or other metadata fields call `updateFrontmatterField()` on the content

**Endpoint behavior changes:**
- `PATCH /notes/:id` with `{ tags: [...] }` → updates the `tags` field in the content's frontmatter block, then updates the database cache
- `POST /notes` → generates initial frontmatter block with `title`, `date`, `tags`
- Existing `title` and `tags` query parameters for search continue to work against the cached database columns

### Phase 3: Desktop Integration

- On note load: parse frontmatter to populate editor title bar, tag display, etc.
- On note save: ensure frontmatter block is updated with current metadata before writing to SQLite and local file
- FTS5 index should index both frontmatter fields and body content
- Sync engine: content arrives with frontmatter embedded — parse and update local cache columns on pull

### Phase 4: Migration

- **Existing notes**: One-time migration that reads each note's database metadata (title, tags, createdAt, updatedAt, favorite, summary) and injects a frontmatter block at the top of the content
- Run on API side for all users; desktop re-derives on next sync pull
- Notes that already have frontmatter (imported from Obsidian, etc.) should be detected and merged rather than duplicated
- Migration should be idempotent (safe to run multiple times)

### Phase 5: Editor UX

- Frontmatter block should be visually distinct in the editor (collapsed header, or dimmed YAML block)
- Consider a "Properties" panel (similar to Obsidian) for editing frontmatter fields via form inputs rather than raw YAML
- Live preview mode should hide the raw frontmatter and show a rendered properties header

## YAML Conventions

- **Delimiters**: `---` / `---` at byte 0 of the file, no leading whitespace
- **Tags**: YAML block list, plural key name, no `#` prefix
- **Dates**: Full ISO 8601 with UTC, quoted to avoid parser ambiguity
- **Strings**: Quote strings that could be misinterpreted as other YAML types
- **Unknown fields**: Preserve on round-trip — never strip fields NoteSync doesn't recognize

## Constraints

- Frontmatter parsing adds ~1-2ms per note — negligible for single notes, but batch operations (sync pull of 100 notes, migration) should be profiled
- Maximum frontmatter size: no hard limit, but warn if > 10KB (likely malformed)
- Binary content in frontmatter is not supported

## Dependencies

- None — this is foundational for features 27–30

## Testing

- Round-trip: parse → serialize → parse produces identical output
- Unknown fields preserved across round-trip
- Standard fields correctly mapped to/from database cache columns
- Migration correctly injects frontmatter into existing notes
- Notes with existing frontmatter (Obsidian imports) handled correctly
- Edge cases: empty content, content with `---` in body (not frontmatter), malformed YAML
- API endpoints correctly manipulate frontmatter in content
- FTS5 indexes frontmatter fields
