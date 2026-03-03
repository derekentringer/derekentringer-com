# NoteSync Web App — Progress Tracker

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | React + Vite | Matches fin-web pattern; served with `serve` in production |
| API | Node.js + Fastify | Shared API for web, mobile, and desktop sync |
| Database | PostgreSQL | Railway-hosted, central source of truth |
| ORM | Prisma | Type-safe schema, migrations, generated client |
| Markdown Editor | CodeMirror 6 | Syntax highlighting, shared with desktop |
| AI Editor Extension | @derekentringer/codemirror-ai-markdown | Custom publishable extension; ghost text completions + select-and-rewrite via Claude API |
| Markdown Preview | react-markdown + remark-gfm | Rendered preview pane |
| Full-Text Search | PostgreSQL tsvector | Server-side keyword search |
| Vector Search | pgvector | Server-side semantic search via embeddings |
| AI | Anthropic Claude API | Tagging, summarization, semantic search, Q&A, inline markdown completions |
| Offline Cache | IndexedDB | Light cache for recently viewed notes; brief offline tolerance |
| Auth | Reuse @derekentringer/shared auth plugin | Single-user JWT + bcrypt, same pattern as fin-web |
| Styling | Tailwind CSS | Consistent with desktop app |
| Hosting | Railway | API as Node.js service, web as static service, PostgreSQL via Railway plugin |
| Domain | notesync.derekentringer.com | Subdomain of existing domain |
| Monorepo | Turborepo (existing) | `packages/ns-api` and `packages/ns-web` in `derekentringer-com` monorepo |
| Language | TypeScript | Everywhere |

## Architecture Decisions

- **React + Vite, not Next.js** — matches fin-web; no SSR needed for a personal tool; production served with `serve`
- **Shared Fastify API** — `ns-api` serves web, mobile, and desktop sync endpoints; single API for all platforms
- **Reuse shared auth** — `@derekentringer/shared` auth plugin provides JWT + bcrypt single-user auth; no new auth system needed
- **Web is thin-cache only** — talks directly to the API; IndexedDB provides brief offline tolerance for recently viewed notes, but desktop and mobile are the true offline-first clients
- **CodeMirror 6 for markdown editing** — same editor as desktop; source editing with syntax highlighting, optional split-pane preview
- **Custom AI editor extension** — `@derekentringer/codemirror-ai-markdown` shared between web and desktop
- **PostgreSQL for search** — tsvector for full-text keyword search, pgvector for semantic search; no local FTS needed since web is always-online
- **Railway deployment** — API uses Docker (multi-stage build, matches fin-api pattern); web uses `serve` for static files
- **Notes stored as markdown** — raw markdown in PostgreSQL; editor shows source with syntax highlighting

## Phases

### Phase 1: Foundation — High Priority

- [x] [00 — Project Scaffolding](features/00-project-scaffolding.md)
- [x] [01 — Auth](features/01-auth.md)

### Phase 2: Notes Core — High Priority

- [x] [02 — Note Management](features/02-note-management.md) — CRUD (create, list, search, update, soft delete), sidebar with note list + search, CodeMirror 6 markdown editor with syntax highlighting + formatting shortcuts (Mod-b/i) + Mod-s save, editor toolbar with view mode toggle (Editor/Split/Preview) + line numbers, split-pane markdown preview (react-markdown + remark-gfm), delete confirmation flow, error toast, Vitest test suites for both ns-api (61 tests) and ns-web (31 tests)
- [~] [03 — Search & Organization](feature_planning/03-search-and-organization.md)
  - [~] 03a — Trash View + Sort (trash list/restore/permanent delete, sort controls, auto-purge)
  - [ ] 03b — Flat Folders + Drag-and-Drop (folder CRUD, @dnd-kit reordering)
  - [ ] 03c — Tags + Full-Text Search (tag browser/CRUD, PostgreSQL tsvector with snippets)

### Phase 3: AI & Offline — Medium Priority

- [ ] [04 — AI Features](feature_planning/04-ai-features.md)
- [ ] [05 — Offline Cache](feature_planning/05-offline-cache.md)

### Phase 4: Polish — Low Priority

- [ ] [06 — Settings](feature_planning/06-settings.md)

## Extension Ideas (Future)

- Note linking / backlinks with graph visualization
- Note templates (meeting notes, journal, project plan)
- Version history (DB revisions with diff view)
- PDF / Markdown / HTML export
- Encrypted notes (end-to-end encryption)
- Kanban board view
- Browser extension for web clipping

## Status Key

- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Complete

## Workflow

1. Feature docs live in `feature_planning/` while in backlog or in-progress
2. When a feature is fully implemented, move its doc to `features/`
3. Update the checkbox and link path in this file
