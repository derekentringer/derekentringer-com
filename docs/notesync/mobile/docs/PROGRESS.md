# NoteSync Mobile App — Progress Tracker

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Expo ~54 | Managed workflow, matches existing fin mobile |
| Language | TypeScript | Shared types with API and web |
| Navigation | React Navigation 7 | Native stack + bottom tabs |
| Server State | TanStack React Query v5 | Consistent with fin mobile |
| Local State | Zustand v5 | Auth and preferences |
| HTTP | axios | Auth interceptor with proactive refresh, matches fin mobile |
| Token Storage | expo-secure-store | Secure credential storage |
| Local Database | expo-sqlite | Full offline copy of all notes; SQLite FTS5 for search |
| Vector Search | sqlite-vec (if supported) | Local semantic search via embeddings |
| Markdown Rendering | react-native-markdown-display | Rendered note preview |
| Bottom Sheet | @gorhom/bottom-sheet v5 | AI actions, note options |
| Haptics | expo-haptics | Tactile feedback on interactions |
| Push | expo-notifications + FCM | Android only (iOS excluded — requires paid Apple Developer account) |
| AI | Anthropic Claude API (via notesync-api) | Tagging, summarization, semantic search, Q&A, writing assistance via toolbar |
| Build | EAS Build | APK for Android sideload, ad-hoc IPA for iOS |
| Monorepo | Turborepo (existing) | `packages/notesync-mobile` in `derekentringer-com` monorepo |

## Architecture Decisions

- **Expo managed workflow** — faster setup, EAS Build, built-in FCM, matches existing fin mobile
- **Monorepo integration** — `packages/notesync-mobile/` shares types and utilities with notesync-api and notesync-web via shared package
- **Offline-first with SQLite** — expo-sqlite holds a full local copy of all notes; app is fully functional without internet
- **Sync engine matches desktop** — same protocol: local SQLite ↔ central PostgreSQL via notesync-api; push first, then pull; last-write-wins conflict resolution
- **No CodeMirror on mobile** — mobile uses a native text input for markdown editing; AI writing assistance via toolbar buttons and bottom sheets instead of ghost text
- **Sideload-only** — APK for Android, ad-hoc IPA for iOS; no app store listings
- **Push notifications Android-only** — iOS requires paid Apple Developer account for APNs
- **Android-focused testing** — both platforms built, but Android is the primary testing target
- **Mobile auth via request body** — `X-Client-Type: mobile` header triggers body-based refresh token delivery (same as fin mobile)
- **Dark mode only** — matches fin mobile pattern initially; light mode as future enhancement

## Phases

### Phase 0: Setup — High Priority

- [ ] [00 — Project Setup & Auth](feature_planning/00-project-setup-and-auth.md)

### Phase 1: Notes Core — High Priority

- [ ] [01 — Note List & Viewer](feature_planning/01-note-list-and-viewer.md)
- [ ] [02 — Note Editor](feature_planning/02-note-editor.md)

### Phase 2: Organization & Sync — High Priority

- [ ] [03 — Search & Organization](feature_planning/03-search-and-organization.md)
- [ ] [04 — Sync Engine](feature_planning/04-sync-engine.md)

### Phase 3: AI — Medium Priority

- [ ] [05 — AI Features](feature_planning/05-ai-features.md)

### Phase 4: Polish — Low Priority

- [ ] [06 — Polish & Distribution](feature_planning/06-polish-and-distribution.md)

## Extension Ideas (Future)

- Note linking / backlinks
- Quick capture widget (home screen widget for Android)
- Share sheet integration (share text from other apps into NoteSync)
- Voice-to-note (speech-to-text → markdown)
- Handwriting input via stylus
- Light mode theme option

## Status Key

- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Complete

## Workflow

1. Feature docs live in `feature_planning/` while in backlog or in-progress
2. When a phase is fully implemented, move its doc to `features/`
3. Update the checkbox and link path in this file
