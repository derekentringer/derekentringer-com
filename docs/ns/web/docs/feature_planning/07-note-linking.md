# 07 — Note Linking + Deep-Linking

**Status:** Complete
**Phase:** Extension
**Priority:** Medium

## Summary

Wiki-link note linking with `[[note title]]` syntax and deep-linking via URL-based note navigation with copy-link button. Both features share navigation infrastructure.

## Goals

1. **Wiki-links**: Type `[[` to get autocomplete of note titles, renders as clickable links in preview, backlinks panel shows incoming references
2. **Deep-linking**: URL routes for individual notes (`/notes/:id`), URL updates when selecting notes, copy-link button for sharing

## Design Decisions

- **Database-backed links**: NoteLink model stores source/target/linkText; links synced on every note save
- **Case-insensitive resolution**: `[[my note]]` matches "My Note" via PostgreSQL `LOWER()` comparison
- **Self-link prevention**: Notes cannot link to themselves
- **Soft-delete awareness**: Deleted notes excluded from resolution and backlinks
- **Remark plugin for rendering**: Custom mdast transform for wiki-link syntax in preview
- **CodeMirror autocomplete**: `[[` triggers completion dropdown with note titles
- **URL sync**: `react-router-dom` params + `navigate()` for URL-based note selection
- **Browser tab title**: `document.title` synced to selected note title for meaningful bookmarks
- **Flash-free backlinks**: Panel retains stale data during fetch to prevent flicker on navigation

## Schema

```prisma
model NoteLink {
  id           String   @id @default(uuid())
  sourceNoteId String
  targetNoteId String
  linkText     String
  createdAt    DateTime @default(now())
  sourceNote   Note     @relation("OutgoingLinks", ...)
  targetNote   Note     @relation("IncomingLinks", ...)
  @@unique([sourceNoteId, targetNoteId, linkText])
  @@map("note_links")
}
```

## API Endpoints

- `GET /notes/titles` — list all note titles for autocomplete
- `GET /notes/:id/backlinks` — get incoming links for a note

## Files

| File | Role |
|------|------|
| `ns-api/prisma/schema.prisma` | NoteLink model |
| `ns-api/src/store/linkStore.ts` | Link extraction, resolution, sync, backlinks |
| `ns-api/src/store/noteStore.ts` | Hooks syncNoteLinks into create/update |
| `ns-api/src/routes/notes.ts` | GET /titles, GET /:id/backlinks |
| `shared/src/ns/types.ts` | BacklinkInfo, NoteTitleEntry types |
| `ns-web/src/lib/remarkWikiLink.ts` | Remark plugin for preview rendering |
| `ns-web/src/editor/wikiLinkComplete.ts` | CodeMirror autocomplete |
| `ns-web/src/components/BacklinksPanel.tsx` | Backlinks panel UI |
| `ns-web/src/components/MarkdownPreview.tsx` | Wiki-link click handling |
| `ns-web/src/pages/NotesPage.tsx` | Deep-linking + wiki-link integration |
| `ns-web/src/App.tsx` | /notes/:noteId route |
