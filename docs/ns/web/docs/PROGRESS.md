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
| AI | Anthropic Claude API | Tagging, summarization, semantic search, AI assistant chat, inline markdown completions |
| Offline Cache | IndexedDB | Light cache for recently viewed notes; brief offline tolerance |
| Auth | Multi-user with JWT + bcrypt + TOTP 2FA | User model, registration, password reset via Resend, admin panel |
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
- [x] [03 — Search & Organization](features/03-search-and-organization.md)
  - [x] 03a — Trash View + Sort (trash list/restore/permanent delete, sort controls, auto-purge)
  - [x] 03b — Flat Folders + Drag-and-Drop (folder CRUD, @dnd-kit reordering, sortOrder, drag-to-folder via cross-component DndContext, inline folder selector)
  - [x] 03c — Tags + Full-Text Search (tag browser/CRUD, PostgreSQL tsvector with snippets, resizable sidebar dividers, NoteSync logo/branding/favicon)
  - [x] 03d — Nested Folders (unlimited-depth folder tree with adjacency list model, drag-and-drop folder nesting/reordering/note-to-folder, macOS Finder-inspired FolderTree component with disclosure triangles, two-mode delete dialog, global search across all folders, collapsible tag browser with show more/less)

### Phase 3: AI & Offline — Medium Priority

- [x] [04 — AI Features](features/04-ai-features.md)
  - [x] 04a — Summarize, Auto-Tag, Inline Completions (Anthropic Claude API via ns-api, SSE streaming ghost text, AI settings page with toggles, sidebar footer redesign)
  - [x] 04a.1 — Completion Style Options (configurable styles: Continue writing, Markdown assist, Brief — per-style system prompts and max_tokens)
  - [x] 04b — Select-and-Rewrite (floating menu with 6 actions, Cmd/Ctrl+Shift+R shortcut, right-click trigger, settings toggle, keyboard shortcuts reference on settings page)
  - [x] 04c — Semantic Search (pgvector embeddings via Voyage AI, keyword/semantic/hybrid search modes, server-side embedding toggle, background processor, hybrid keyword-match bonus, content-length filter for search quality)
  - [x] 04d — Audio Notes (voice recording → AI-structured markdown via Whisper + Claude, AudioRecorder component with mode selection, draggable split view divider)
  - [x] 04d.1 — Search Quality & Settings Info Tooltips (hybrid keyword-match bonus, semantic content-length filter, embedding processor empty-content fix, hover info tooltips on all AI settings)
  - [x] 04e — AI Assistant Chat (collapsible right-side panel with streaming AI answers, citation pills, markdown rendering, right-click context menus on notes, cursor-positioned context menus on folders/notes)
  - [x] 04e.1 — UI Polish (AudioRecorder moved to sidebar header, ConfirmDialog for delete actions on notes/folders/summaries, summary delete button)
  - [x] 04f — Duplicate Detection (skipped)
  - [x] 04g — Continue Writing & Structure Suggestions (Cmd/Ctrl+Shift+Space for paragraph continuation or structure suggestions, separate settings toggle, tag suggestion prompt fix, QA panel auto-focus and header removal, placeholder hidden on editor focus, save-before-AI-call fix)
- [x] [05 — Offline Cache](features/05-offline-cache.md) — IndexedDB caching layer with offline note reading, queued offline edits (create/update/delete), auto-sync on reconnect with temp ID reconciliation, online status indicator, 100-note cache limit with LRU eviction

### Phase 4: Polish — Low Priority

- [x] [06 — Settings](features/06-settings.md) — Theme toggle (dark/light/system), configurable accent color (11-preset palette with dark/light variants and contrast-aware text), editor font size slider, default view mode, line numbers, word wrap, auto-save delay, tab size, cursor style (line/block/underline) and cursor blink toggle, AI feature toggles with master switch, completion styles and delay, audio modes, info tooltips, keyboard shortcuts reference, offline cache management (cached note count, max cache size, last synced, clear cache), trash retention period (server-side setting with 7/14/30/60/90 days or Never, purge job integration), `useEditorSettings` and `useAiSettings` hooks with localStorage persistence and validated loading

## Extensions

- [x] [07 — Note Linking + Deep-Linking](features/07-note-linking.md) — Wiki-link `[[note title]]` syntax with case-insensitive resolution, CodeMirror autocomplete on `[[`, remark preview plugin with resolved/broken link styles, NoteLink database model with cascade delete, backlinks panel with collapsible incoming references and flash-free navigation, deep-linking via `/notes/:id` URL routes with URL sync on navigation, copy-link button with clipboard feedback, browser tab title sync for bookmarks, 23 new tests across ns-api and ns-web

- [x] [08 — Version History](features/08-version-history.md) — NoteVersion snapshots on save (configurable interval: every save / 5 / 15 / 30 / 60 min, 50-cap per note), version list panel in tabbed right-side drawer (shared with AI Assistant), unified and split diff views with green/red highlighting, two-step restore with auto-dismissing success toast, stacked tab buttons (chat + clock icons) positioned above backlinks panel, resizable right drawer panel with persisted width, draggable backlinks panel with persisted height and collapsed state, version interval setting in Settings page, cascade delete on note removal

- [x] [09 — Favorites](features/09-favorites.md) — Favorite notes and folders via right-click context menus, collapsible Favorites panel above Folders in sidebar with localStorage persistence, star indicators (★) in FolderTree and NoteList, dedicated API endpoints (GET /notes/favorites, PUT /notes/favorites/reorder, PATCH /notes/folders/:id/favorite), offline support with IndexedDB merge, real-time title sync in favorites panel, collapsible Folders section header, 14px section headers (Favorites/Folders/Notes), sort dropdown (Manual/Modified/Created/Title) with asc/desc toggle inline with panel header, drag-and-drop manual reordering via `@dnd-kit/sortable`, `favoriteSortOrder` database column with auto-assignment on favorite toggle, default sort Modified Descending, API SSE broadcasts on all note/folder mutations for real-time cross-device sync, comprehensive test coverage across 23+ files

### Phase 5: Multi-User — High Priority

- [x] [10 — Multi-User Auth](features/10-multi-user-auth.md) — User model with per-user data isolation (userId on all notes/folders/sync cursors), email-based registration gated by admin-managed approved list, password reset via Resend email service, TOTP two-factor authentication with backup codes, admin panel (user management, approved emails, global AI toggle), shared password strength validation, database-backed login replacing env-var auth

### Architecture Hardening

- [x] [11 — Architecture Hardening](features/11-architecture-hardening.md) — 6 high-priority fixes from architecture review: error toast on note switch save failure, offline queue transient error retry with max 3 retries and permanent error skip, console.error logging on fire-and-forget syncNoteLinks/captureVersion, refresh token reuse detection with soft-delete and session family invalidation, CSRF defense-in-depth via X-Requested-With header on /auth/refresh, audio upload magic byte validation (WebM/MP4/MP3/WAV/OGG)

### UI Enhancements

- [x] [12 — Editor Tabs](features/12-editor-tabs.md) — VS Code-style tab bar with permanent tabs (double-click), preview tabs (single-click always creates preview tab with italic title, auto-pin on edit), drag-and-drop tab reordering (horizontal axis only via `@dnd-kit/sortable` + `restrictToHorizontalAxis`), compact icon-only toolbar, middle-click close, trash view integration with tab state preservation, 22 new tests across TabBar and NotesPage

- [x] Custom scrollbar styling — thin themed scrollbars via `scrollbar-width`/`scrollbar-color` (Firefox) and `::-webkit-scrollbar` (Chrome/Edge) matching dark/light themes; fixes default Windows Chrome scrollbars in editor and preview areas

- [x] UI cursor polish — `cursor-pointer` on all interactive elements across the app (toolbar buttons, sidebar icons, tags, tab close buttons, folder items, context menus, drawer tabs, audio controls, sort dropdown, tag remove buttons, confirm dialogs, note list items, trash toolbar buttons, bulk delete buttons); styled sort `<select>` dropdown with `appearance-none`, custom SVG chevron, `bg-subtle` background matching desktop app

- [x] Keyboard shortcuts unification — Added Cmd/Ctrl+K (focus search) shortcut to web (ported from desktop), added Cmd/Ctrl+K to Settings keyboard shortcuts list; ensures web and desktop have identical keyboard shortcuts

- [x] Import/Export — ImportButton component with file picker + folder picker dropdown in sidebar footer, drag-and-drop file/folder import with folder structure preservation, export notes as .md/.txt/.pdf via right-click context menu, export folders as .zip with nested structure via JSZip, PDF export via print window with styled HTML and `marked` markdown renderer

- [x] [14 — Sync Status Indicator](features/14-sync-status-indicator.md) — Replaced 2-state green/yellow dot `OnlineStatusIndicator` with interactive 4-state `SyncStatusButton` (idle/syncing/error/offline) matching desktop app, SSE `onConnect` callback for confirmed connection status, sync status state tracking with `Promise.all` reload, click-to-sync manual refresh, dimmed green idle icon (`text-green-600/50`), `pendingCount` tooltip enrichment for offline state, 10 new component tests + 2 SSE tests

- [x] Interactive markdown checkboxes — GFM task list checkboxes (`- [ ]` / `- [x]`) in preview and split modes are now clickable; toggling a checkbox updates the underlying markdown content and triggers autosave; DOM-based index lookup at click time for reliable checkbox identification across React re-renders; trash view checkboxes remain disabled (read-only); `toggleCheckbox` utility with full test coverage, MarkdownPreview `onContentChange` prop with 3 new component tests

- [x] [17 — Code Block Copy Button](features/17-code-block-copy-button.md) — Hover-reveal "Copy" button on fenced code blocks in markdown preview, copies code to clipboard via `navigator.clipboard.writeText()`, checkmark feedback for 2s, `CodeBlock` component as react-markdown `pre` override, refactored `markdownComponents` to always build (copy button works in trash view), inline SVG icons (clipboard + checkmark), CSS opacity transition on hover, 5 new tests

### Bug Fixes

- [x] File drag-and-drop import tab fix — `handleImportFiles` called `selectNote` instead of `openNoteAsTab`, so drag-imported notes appeared in sidebar but didn't open a tab; fixed to match `handleCreate` behavior

- [x] Note timestamps in status bar — Created date and Modified date+time displayed in the toolbar status bar next to save status, separated by middle-dot (`·`) separators, with full date+time hover tooltips; `text-[11px] text-muted-foreground` styling matching save status

- [x] Remote delete tab closing — When a note is deleted on another NoteSync instance (desktop or web), open tabs for that note now close automatically; uses `fetchNote` API calls with 404 detection and functional state updaters to avoid stale closures in SSE handlers

- [x] Local file indicator — Notes linked to local files on desktop show a muted file icon in the note list with "Linked to a local file" tooltip, and an info bar in the editor: "This note is linked to a local file on a desktop device"

- [x] [16 — Dashboard](features/16-dashboard.md) — Rich dashboard replaces empty editor state when no note is selected, showing Quick Actions (New Note, New Recording, Import File), Resume Editing hero card, horizontal-scroll Favorites/Recently Edited/Audio Notes sections with `DashboardNoteCard` (default + hero variants), `DashboardSection` wrapper, `audioMode` field across full stack (shared types → Prisma → API → web), `GET /notes/dashboard` endpoint, scrollbar fade animation via CSS `@property --scroll-thumb-color` with `inherits: true` and 0.3s ease transition, tag browser `transition-[max-height,opacity]` replacing `transition-all` to avoid hover jitter, `cursor-pointer` on suggested tag accept/dismiss buttons and tag suggestion dropdowns, 14 new tests

### Reliability

- [x] [13 — Sync Hardening](features/13-sync-hardening.md) — SSE reconnection storm fix (refs pattern for stable callbacks, connect-once-on-mount), pre-connect JWT expiry check with proactive token refresh, notes/favorites sort persistence to localStorage with validation, case-insensitive title sort via raw SQL `ORDER BY LOWER("title")` with explicit column list, atomic sync push with `prisma.$transaction()` and LWW skip tracking, pull cursor accuracy using `MAX(updatedAt)` from returned data, SSE hub dead stream immediate cleanup and per-user connection limit (max 5), `updatedAt` indexes on Note and Folder, stale sync cursor cleanup, search SQL column alignment (`favoriteSortOrder`, `folderId`)

- [x] [15 — Centralized TokenManager](features/15-centralized-token-manager.md) — Shared `TokenManager` in `@derekentringer/shared/token` with factory function + platform-specific adapter pattern, proactive token refresh (60s interval, 2min threshold), JWT expiry parsing via shared `parseJwt.ts`, refresh promise deduplication, typed `AuthFailureReason` propagation to AuthContext, dynamic SSE reconnect timer from `tokenManager.getMsUntilExpiry()`, 10% jitter on reconnect delay, 401/403 distinction in SSE (refresh+retry vs stop), revoked token DB cleanup in ns-api refresh endpoint, `CustomEvent("auth:logout")` with reason detail, 37 new tests (shared + SSE)

## Extension Ideas (Future)

- Note templates (meeting notes, journal, project plan)
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
