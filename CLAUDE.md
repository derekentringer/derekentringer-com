# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and tools monorepo for Derek Entringer (derekentringer.com). Turborepo workspace with React + Vite web app, Fastify API, and shared packages.

## Development

```bash
npm install          # Install all workspace dependencies
npx turbo run dev    # Start all dev servers (web :3000, api :3001, fin-api :3002, fin-web :3003, ns-api :3004, ns-web :3005)
npx turbo run build  # Build all packages
npx turbo run type-check  # Type-check all packages
```

**Dev server port notes**: When running `npx turbo run dev`, the `api` package (health-check stub on :3001) often fails with `EADDRINUSE` because it races with other turbo tasks for ports. This is not a problem — the `api` package is just a health-check stub and isn't needed for finance feature development. The important services are `fin-api` (Fastify on :3002), `fin-web` (Vite on :3003), `ns-api` (Fastify on :3004), and `ns-web` (Vite on :3005). Vite auto-increments ports when collisions occur, so check the turbo output for actual port numbers. Before starting dev servers, always kill old processes first: `pkill -9 -f "vite|tsx watch|turbo"` then `lsof -ti :3000,:3001,:3002,:3003,:3004,:3005 | xargs kill -9`. CORS on fin-api defaults to `http://localhost:3003`, so fin-web **must** be on port 3003 for login to work. CORS on ns-api defaults to `http://localhost:3005`, so ns-web **must** be on port 3005 for login to work. If either lands on another port, sign-in will fail with CORS errors.

## Git Workflow

This project uses **gitflow**:

- `main` — production releases, auto-deployed to Railway
- `develop` — integration branch
- `feature/*` — feature branches off `develop`
- All changes go through PRs: `feature/*` → `develop` → `main`
- Tag releases on `main` (e.g., `v1.0.5`)

## Deployment

- **Platform**: Railway (Railpack builder, not Docker)
- **Web**: Railpack auto-detects Node workspace; start command is `npm run start --workspace=@derekentringer/web` (configured in Railway dashboard)
- **Web production server**: `serve` static file server bound to `0.0.0.0:$PORT` with SPA fallback (`-s` flag)
- **API**: `packages/api/Dockerfile` — multi-stage Node build on port 3001
- **Finance Web**: Railpack; start command `npm run start --workspace=@derekentringer/fin-web`; `serve` static file server with SPA fallback; custom domain `fin.derekentringer.com`; env: `VITE_API_URL=https://fin-api.derekentringer.com` (build-time)
- **Finance API**: Railpack; start command `npm run db:migrate:deploy --workspace=@derekentringer/fin-api && npm run start --workspace=@derekentringer/fin-api`; Fastify on `0.0.0.0:$PORT`; custom domain `fin-api.derekentringer.com`; env: `NODE_ENV`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN=https://fin.derekentringer.com`, `DATABASE_URL` (from Railway Postgres plugin), `ENCRYPTION_KEY` (64-char hex), `RESEND_API_KEY` (password reset emails), `APP_URL=https://fin.derekentringer.com` (frontend URL for email links)
- **NoteSync Web**: Railpack; start command `npm run start --workspace=@derekentringer/ns-web`; `serve` static file server with SPA fallback; custom domain `ns.derekentringer.com`; env: `VITE_API_URL=https://ns-api.derekentringer.com` (build-time)
- **NoteSync API**: Railpack; start command `npm run db:migrate:deploy --workspace=@derekentringer/ns-api && npm run start --workspace=@derekentringer/ns-api`; Fastify on `0.0.0.0:$PORT`; custom domain `ns-api.derekentringer.com`; env: `NODE_ENV`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN=https://ns.derekentringer.com`, `DATABASE_URL` (from Railway Postgres plugin), `OPENAI_API_KEY` (for Whisper audio transcription), `RESEND_API_KEY` (password reset emails), `APP_URL=https://ns.derekentringer.com` (frontend URL for email links), `RP_ID=ns.derekentringer.com` (WebAuthn passkey domain), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=notesync-images`, `R2_PUBLIC_URL=https://notesync-images.derekentringer.com` (Cloudflare R2 image storage)
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — type-check + build on PRs and pushes to main
- **DNS**: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME)
- **www redirect**: Client-side redirect in `App.tsx` from `www.derekentringer.com` → `derekentringer.com`

Note: Railway skips Dockerfiles not at the repo root. The web Dockerfile exists for local Docker testing but Railway uses Railpack in production. Do not set watch paths on Railway services — cross-package dependencies (e.g., shared → fin-api) cause deploys to be silently skipped when changes land outside the watched paths.

## Architecture

```
packages/
  web/          — React + Vite + React Router SPA (portfolio site)
  api/          — Fastify API server (health-check stub)
  fin-web/      — React + Vite SPA (personal finance dashboard)
  fin-api/      — Fastify API server (personal finance backend)
  ns-web/       — React + Vite SPA (NoteSync note-taking app)
  ns-api/       — Fastify API server (NoteSync backend)
  shared/       — Shared TypeScript types and utilities
  ns-desktop/   — Tauri v2 desktop app (NoteSync for macOS)
  ns-mobile/    — React Native app (NoteSync for Android/iOS)
  fin-mobile/   — React Native app (Finance for Android/iOS)
```

### NoteSync Desktop (`packages/ns-desktop/`)

- Tauri v2 desktop app wrapping the NoteSync web frontend
- **Feature docs**: `docs/ns/desktop/docs/features/` (00–27), progress tracker at `docs/ns/desktop/docs/PROGRESS.md`
- **Feature planning docs**: `docs/ns/desktop/docs/feature_planning/` for planned/in-progress features
- `src-tauri/tauri.conf.json` — Tauri config (bundle ID: `com.derekentringer.notesync`, `bundle.macOS.infoPlist` points to `Info.plist`, `bundle.macOS.entitlements` points to `NoteSync.entitlements`)
- `src-tauri/Info.plist` — Custom plist merged into built app by Tauri v2 bundler (`NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription`); must be referenced as a path string in `tauri.conf.json`, not an inline object
- `src-tauri/NoteSync.entitlements` — macOS entitlements (`com.apple.security.device.audio-input`); required for TCC microphone prompt with hardened runtime + ad-hoc signing
- `src-tauri/src/audio_capture.rs` — macOS meeting-mode capture (mic via AudioUnit + system audio via CoreAudio Process Tap on macOS 14.2+). Gated behind `#[cfg(target_os = "macos")]`.
- `src-tauri/src/audio_capture_win.rs` — Windows meeting-mode capture via `cpal` WASAPI (mic via `default_input_device`, system audio via `default_output_device` in loopback mode). Gated behind `#[cfg(target_os = "windows")]`. See `docs/ns/desktop/docs/features/27-windows-meeting-audio-capture.md`.
- `src-tauri/src/audio_capture_shared.rs` — Platform-agnostic helpers used by both OS modules: `to_mono`, `ChunkResampler`, `read_pcm_since`, `spawn_writer_thread`, `encode_mixed_wav_chunk`, `mix_to_wav`. Compiled on macOS + Windows (both targets that support meeting mode).
- `src-tauri/src/lib.rs` — Tauri command handlers: `download_file(url, savePath)` downloads images via `reqwest` (bypasses WebView CORS), keyring secure storage, audio recording lifecycle (dispatches to `audio_capture` on macOS / `audio_capture_win` on Windows), SQLite migration registration (001-011)
- `src-tauri/capabilities/default.json` — Tauri v2 permissions: binary file read/write (`fs:allow-read-file`, `fs:allow-write-file`), text file read/write, directory listing, file watching, dialog open/save, fs scope `**`
- `src-tauri/Cargo.toml` — Rust dependencies include `reqwest` (rustls-tls) for native HTTP downloads, `keyring` for secure storage, `hound` for WAV encoding (top-level, used by shared audio helpers), `coreaudio-rs` + `objc2-core-audio` + `core-foundation` for macOS audio capture (target-gated to macOS), `cpal` for Windows audio capture (target-gated to Windows)
- `src/lib/syncEngine.ts` — Offline-first sync engine with SSE, push/pull, exponential backoff; handles `"note"`, `"folder"`, and `"image"` change types; `onSyncRejections` callback surfaces per-change rejection details with `forcePushChanges()` and `discardChanges()` action closures; offline image upload queue with `pending_upload` status
- `src/components/SyncIssuesDialog.tsx` — Dialog for resolving rejected sync changes (per-item + bulk Force Push / Discard)
- `src/components/SyncStatusButton.tsx` — Sync status icon; shows rejection-aware click behavior when `hasRejections` is true
- UI/UX must match `ns-web` — desktop components mirror web components
- **Build reference**: `docs/ns/desktop/docs/BUILD.md` is the authoritative cross-platform build doc (matrix of scripts, env var precedence, output locations, common pitfalls). Always read it before debugging a build issue; the notes below are a summary.
- **Hot-reload dev**: `npm run dev` (Tauri dev mode) — fastest iteration, points at `http://localhost:3004`.
- **Build (local packaged, macOS)**: `npm run tauri:build` — syncs git tag with `-0` suffix (e.g., `2.25.0-0`), builds x64 macOS binary; `VITE_API_URL=http://localhost:3004` is set explicitly via `cross-env` inside the script, so the baked URL does NOT depend on `.env.production`.
- **Build (local packaged, Windows)**: `npm run tauri:build:win` — same shape as macOS local; builds x64 Windows MSI + NSIS with `VITE_API_URL=http://localhost:3004`.
- **Build (prod signed, macOS)**: `npm run tauri:build:prod` — syncs git tag version (no suffix), clears WebKit cache, builds universal macOS binary with ad-hoc signing and `VITE_API_URL=https://ns-api.derekentringer.com`.
- **Build (prod unsigned, Windows)**: `npm run tauri:build:prod:win` — syncs git tag, builds x64 Windows MSI + NSIS with `VITE_API_URL=https://ns-api.derekentringer.com`. Unsigned (ad-hoc) — SmartScreen shows "Unknown publisher" warnings, acceptable for personal use.
- **Why every build script uses `cross-env` to set `VITE_API_URL`**: `tauri build` invokes Vite in production mode, which loads `.env.production`. That file is gitignored and per-machine — historically, machines with a prod URL in `.env.production` would silently bake prod into "local" builds. Setting `VITE_API_URL` inline via `cross-env` overrides any `.env*` file and makes the build deterministic regardless of local env file contents. Never remove the inline `cross-env VITE_API_URL=...` from any build script.
- **Pre-release suffix `-0` (not `-dev`)**: local builds tag the version as `<tag>-0` via `tauri:version-sync:dev`. The Windows MSI bundler requires pre-release identifiers to be numeric-only and ≤ 65535, so `-dev` fails with `optional pre-release identifier in app version must be numeric-only and cannot be greater than 65535 for msi target`. `-0` satisfies the constraint and is used on both platforms for script parity.
- **Build output (local macOS)**: `src-tauri/target/release/bundle/macos/NoteSync.app` and `src-tauri/target/release/bundle/dmg/NoteSync_<version>-0_x64.dmg`
- **Build output (prod macOS)**: `src-tauri/target/universal-apple-darwin/release/bundle/macos/NoteSync.app` and `.../dmg/NoteSync_<version>_universal.dmg`
- **Build output (local Windows)**: `src-tauri/target/release/bundle/msi/NoteSync_<version>-0_x64_en-US.msi` and `src-tauri/target/release/bundle/nsis/NoteSync_<version>-0_x64-setup.exe`
- **Build output (prod Windows)**: `src-tauri/target/release/bundle/msi/NoteSync_<version>_x64_en-US.msi` and `src-tauri/target/release/bundle/nsis/NoteSync_<version>_x64-setup.exe`
- **Local and prod Windows builds share `src-tauri/target/release/`**: bundle filenames include the version so MSIs/NSIS files don't collide, but the top-level `NoteSync.exe` is overwritten on each build. If you need both versions side-by-side, copy the bundle files out between runs.
- **Local vs prod SQLite**: The desktop uses separate SQLite databases per environment. When `VITE_API_URL` contains "localhost", it uses `notesync_localhost.db`; otherwise `notesync.db` (see `src/lib/dbName.ts`). To reset the local database: `rm ~/Library/Application\ Support/com.derekentringer.notesync/notesync_localhost.db`
- **No FK constraints on sync-payload columns in SQLite**: Columns populated from sync pulls (e.g. `folders.parent_id`, `images.note_id`, `notes.folder_id`) must NOT have `REFERENCES` / `FOREIGN KEY` constraints. The remote server is the source of truth and is eventually consistent — a child row can legitimately arrive in a sync batch before its parent, and FK enforcement causes silent INSERT failures that the sync engine's try/catch swallows, leading to permanent data loss. Migrations 013 and 014 dropped the FKs on `folders.parent_id` and `images.note_id` respectively after this bug class was discovered. Derived-data tables that are *populated locally after* a sync (`note_links`, `note_versions`, `note_embeddings`) are fine to keep FKs because their parent notes are always present first. Rule of thumb: if a column's value comes from a sync payload, no FK.
- **Local ns-api CORS**: The ns-api `.env` must include Tauri origins for desktop to connect locally: `CORS_ORIGIN=http://localhost:3005,http://localhost:3006,tauri://localhost,https://tauri.localhost,http://tauri.localhost`. The `http://tauri.localhost` origin is required for Tauri v2 on Windows (the Windows webview serves content from that origin, while macOS uses `tauri://localhost`).
- **Windows dev**: requires Docker Desktop + pgvector Postgres container for local ns-api (pgvector is not easily buildable against native Windows Postgres). See "Windows dev environment" section below.
- **Windows Rust cross-compile gotcha**: `RunEvent::Opened` (file-association open events) is macOS-only and must be gated behind `#[cfg(target_os = "macos")]` in `src-tauri/src/lib.rs` — otherwise Windows builds fail with `E0599: no variant named 'Opened'`. `audio_capture.rs` (CoreAudio) and `audio_capture_win.rs` (WASAPI via cpal) are both properly gated via `#[cfg(target_os = ...)]` on the `mod` declarations; the Tauri command handlers dispatch per platform inside `#[cfg]` arms.
- **Windows meeting-mode permissions**: system audio loopback requires no permission on Windows; microphone capture requires **Settings → Privacy & Security → Microphone → Let desktop apps access your microphone** to be ON (the per-app Windows privacy toggle that applies to Tauri/WebView2). If the top-level "Microphone access" is on but the desktop-apps toggle is off, `cpal` fails to open the mic stream; the system loopback still works and recording proceeds with system-audio-only content.
- **Local ns-api migrations**: `prisma migrate dev` does not work locally (access denied). Run migration SQL manually: `psql "postgresql://derekentringer@localhost:5432/notesync" -f prisma/migrations/<migration_dir>/migration.sql`. Check applied migrations with: `psql "postgresql://derekentringer@localhost:5432/notesync" -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;"`
- **Dev**: `npm run dev` (Tauri dev mode on port 3006)
- **macOS permissions**: Hardened runtime requires `com.apple.security.device.audio-input` entitlement for TCC microphone prompt. Without it, macOS silently denies without prompting.
- **Reset macOS permissions**: `tccutil reset Microphone com.derekentringer.notesync` and `tccutil reset ScreenCapture com.derekentringer.notesync`

### Web (`packages/web/`)

- `src/App.tsx` — Routes + www redirect + analytics tracking
- `src/pages/PortfolioPage.tsx` — Main landing page (centered name/title/link)
- `src/pages/PrivacyPage.tsx` — Privacy policy
- `src/pages/NotFoundPage.tsx` — 404 page
- `src/styles/global.css` — Dark theme base styles
- `src/utils/analytics.ts` — Google Analytics pageview tracking
- `src/utils/useDocumentHead.ts` — Lightweight document head management (title, meta, link tags)
- CSS Modules (`*.module.css`) for component-scoped styles
- `public/robots.txt` — Allows only homepage indexing, blocks all other paths

### API (`packages/api/`)

- `src/index.ts` — Fastify server with `GET /health` endpoint

### Finance Web (`packages/fin-web/`)

- React + Vite SPA for personal finance dashboard
- **Feature docs**: `docs/fin/web/docs/features/` (00–16), progress tracker at `docs/fin/web/docs/PROGRESS.md`
- **Feature planning docs**: `docs/fin/web/docs/feature_planning/` for planned/in-progress features
- `src/App.tsx` — Routes + auth-gated layout
- `src/pages/LoginPage.tsx` — Login form with email/password and TOTP 2FA support
- `src/context/AuthContext.tsx` — JWT auth state management with multi-user support
- `src/components/FinLogo.tsx` — Inline SVG logo component (two-peaks icon)
- `src/components/Sidebar.tsx` — Navigation sidebar with logo in header (expanded + collapsed)
- `src/components/Header.tsx` — Top header with logo on mobile
- `public/` — Favicon (ICO + PNG), apple-touch-icon, Android Chrome icons, `site.webmanifest`, `logo.svg`
- `public/robots.txt` — Blocks all crawlers and AI agents (blanket `Disallow: /` plus explicit AI bot rules)
- `index.html` includes `<meta name="robots" content="noindex, nofollow" />` as defense-in-depth
- API URL configured via `VITE_API_URL` env var (build-time)
- Production domain: `fin.derekentringer.com`

### Finance API (`packages/fin-api/`)

- Fastify server with JWT auth (access + refresh tokens), multi-user with TOTP 2FA
- `src/index.ts` — Server entry, CORS via `CORS_ORIGIN` env var
- `src/routes/auth.ts` — Login, register, refresh, logout, password reset/change endpoints
- `src/routes/admin.ts` — Admin panel routes (user management, approved emails, AI toggle)
- `src/routes/totp.ts` — TOTP 2FA setup, verify, disable endpoints
- `GET /robots.txt` — Blocks all crawlers (blanket `Disallow: /`)
- `src/plugins/auth.ts` — JWT verification, cookie handling
- Database-backed users with bcrypt password hashing and per-user data isolation
- Production domain: `fin-api.derekentringer.com`
- **Database**: PostgreSQL via Prisma ORM (v7)
  - `prisma/schema.prisma` — Database schema (User, RefreshToken, Account, Transaction, Balance, Setting, PasswordResetToken)
  - `prisma.config.ts` — Prisma CLI config (datasource URL, migrations path)
  - `src/generated/prisma/` — Generated Prisma client (gitignored)
  - `src/lib/prisma.ts` — PrismaClient singleton with `@prisma/adapter-pg` (SSL without certificate verification in production — Railway Postgres does not support verified SSL)
  - `src/lib/encryption.ts` — AES-256-GCM field-level encryption (wraps shared crypto)
  - `src/lib/mappers.ts` — Prisma row ↔ API type mappers with encrypt/decrypt
- **Prisma commands** (run from `packages/fin-api/`):
  - `npm run db:migrate:dev` — Create/apply dev migration
  - `npm run db:migrate:deploy` — Apply migrations in production
  - `npm run db:seed` — Run seed script
  - `npm run db:studio` — Open Prisma Studio
- **Local database**: `prisma migrate dev` does not work locally (access denied). Run migration SQL manually instead: `psql "postgresql://derekentringer@localhost:5432/finance" -c '<SQL>'`. Production migrations are applied automatically via the Railway start command.
- `src/config.ts` — App config with secret enforcement (all secrets required outside `development`/`test` environments)
- **Env vars**: `DATABASE_URL` (PostgreSQL connection string), `ENCRYPTION_KEY` (64-char hex, 32 bytes for AES-256-GCM), `RESEND_API_KEY` (password reset emails), `APP_URL` (frontend URL for email links, defaults to `http://localhost:3003`)
- **Railway start command**: `npm run db:migrate:deploy --workspace=@derekentringer/fin-api && npm run start --workspace=@derekentringer/fin-api`

### NoteSync Web (`packages/ns-web/`)

- React + Vite SPA for note-taking app
- **Feature docs**: `docs/ns/web/docs/features/` (00–24), progress tracker at `docs/ns/web/docs/PROGRESS.md`
- **Feature planning docs**: `docs/ns/web/docs/feature_planning/` for planned/in-progress features
- `src/App.tsx` — Routes + auth-gated layout
- `src/pages/LoginPage.tsx` — Login form with NoteSync branding and logo
- `src/pages/NotesPage.tsx` — Notes view with sidebar + editor shell
- `src/components/SidebarTabs.tsx` — Tabbed sidebar (Explorer, Search, Favorites, Tags)
- `src/components/Ribbon.tsx` — Vertical utility strip (new note, 4 audio recording buttons, settings, game, sync)
- `src/components/NoteListPanel.tsx` — Separate resizable note list panel
- `src/components/AudioRecorder.tsx` — Headless audio recording with `triggerMode`/`triggerKey` props; supports mic (web) and system+mic (desktop meeting mode); chunked transcription every 20s during recording for live Meeting Assistant; saves transcript directly via API PATCH on recording stop
- `src/components/RecordingBar.tsx` — Floating top bar during recording with waveform and folder picker
- `src/components/AIAssistantPanel.tsx` — AI chat + Meeting Assistant (formerly QAPanel); during recording shows collapsible Related Notes + resizable Transcription sections with typing animation; "Meeting Ended" card persisted in chat
- `src/components/TranscriptViewer.tsx` — Read-only transcript display with close button; replaces editor area when viewing transcript
- `src/components/FolderPicker.tsx` — Reusable folder dropdown with depth indentation; used in note title area and recording bar
- `src/hooks/useMeetingContext.ts` — Polls `/ai/meeting-context` every 45s during recording; pgvector semantic search against note embeddings
- `src/components/AudioWaveform.tsx` — Real-time audio visualization via Web Audio API
- `src/components/SyncSwarmGame.tsx` — Hidden Galaga-style ASCII space shooter
- `src/components/Dashboard.tsx` — Rich dashboard with quick actions, recent notes, favorites
- `src/components/NsLogo.tsx` — Inline SVG logo component (lime-yellow rounded square with `+`)
- `src/components/EditorToolbar.tsx` — Editor toolbar with view mode tabs (Editor, Split, Live, Preview), formatting buttons, line number toggle
- `src/components/MarkdownEditor.tsx` — CodeMirror 6 editor with live preview compartment, table auto-format, minimal-diff value sync
- `src/components/ResizeDivider.tsx` — Draggable divider for resizable sidebar panels
- `src/editor/livePreview.ts` — Obsidian-style live preview: inline markdown rendering, rendered HTML table widget with click-to-edit, ARIA-accessible checkbox/bullet/table widgets, CSS variable theming
- `src/editor/tableAutoFormat.ts` — Auto-format table column spacing on cursor leave
- `src/lib/sourceMap.ts` — Maps clicked DOM elements in preview to source line numbers (headings, paragraphs, code blocks, tables, lists, blockquotes, images, HRs)
- `src/lib/remarkWikiLink.ts` — Remark plugin for `[[wiki-link]]` syntax with `#wiki:` URL scheme for react-markdown v10 compatibility
- `src/hooks/useResizable.ts` — Custom hook for drag-resize with localStorage persistence
- `src/context/AuthContext.tsx` — JWT auth state management (no PIN layer)
- `src/api/client.ts` — `apiFetch()` with Bearer token, 401 refresh retry
- `public/` — Favicon (ICO + PNG), apple-touch-icon, Android Chrome icons, `site.webmanifest`, `logo.svg`
- `public/robots.txt` — Blocks all crawlers and AI agents
- `index.html` includes `<meta name="robots" content="noindex, nofollow" />`
- API URL configured via `VITE_API_URL` env var (build-time, defaults to `http://localhost:3004`)
- Production domain: `ns.derekentringer.com`
- Dev port: 3005
- Accent color: lime-yellow (`#d4e157`)

### NoteSync API (`packages/ns-api/`)

- Fastify server with JWT auth (access + refresh tokens, no PIN layer)
- `src/index.ts` — Server entry, port 3004
- `src/app.ts` — App factory with CORS, helmet, rate-limit, cookie, auth plugins
- `src/routes/auth.ts` — Login, refresh, logout endpoints
- `src/routes/sync.ts` — Sync push/pull/SSE endpoints; push returns per-change `SyncRejection` details (FK, unique, not_found, timestamp_conflict); `force` flag on `SyncChange` bypasses timestamp checks and retries FK violations with null foreign key
- `src/routes/health.ts` — `GET /health` endpoint
- `GET /robots.txt` — Blocks all crawlers (blanket `Disallow: /`)
- `src/config.ts` — App config with secret enforcement
- `src/services/whisperService.ts` — OpenAI Whisper transcription with retry on 502/503/504 (up to 2 retries with backoff); chunked transcription for large audio files
- `src/services/aiService.ts` — Anthropic Claude AI (completions, summaries, tags, rewrite, Q&A); `structureTranscript`, `suggestTags`, and `answerQuestion` all retry on 502/503/504/529 (up to 2 retries with backoff)
- `src/routes/ai.ts` — AI endpoints (`/ai/complete`, `/ai/ask`, `/ai/summarize`, `/ai/tags`, `/ai/rewrite`, `/ai/transcribe`, `/ai/transcribe-chunk`, `/ai/structure-transcript`, `/ai/meeting-context`, `/ai/embeddings/*`); Q&A SSE stream sends `error` event on failure; embeddings text limit 50K chars; Q&A context enriched with image `aiDescription` values; `transcribe-chunk` accepts individual audio chunks for live meeting transcription; `meeting-context` generates query embedding and performs pgvector similarity search for note matching
- `src/routes/images.ts` — Image upload (`POST /images/upload` with multipart, MIME/magic byte validation, 10MB limit), list (`GET /images/note/:noteId`), soft-delete (`DELETE /images/:imageId`); Cloudflare R2 storage via `@aws-sdk/client-s3`; fire-and-forget Claude vision analysis generates `aiDescription` for AI chat and semantic search indexing
- `src/services/r2Service.ts` — S3-compatible client for Cloudflare R2 (upload, delete, batch delete); key format `{imageId}.{ext}`
- `src/store/imageStore.ts` — Image CRUD, AI description updates, batch queries for Q&A context, sync pull queries
- Multi-user auth with database-backed users (registration, login, password reset, TOTP 2FA, WebAuthn passkeys)
- Production domain: `ns-api.derekentringer.com`
- **Database**: Separate PostgreSQL instance via Prisma ORM (v7)
  - `prisma/schema.prisma` — Database schema (Note, SyncCursor, RefreshToken)
  - `prisma.config.ts` — Prisma CLI config
  - `src/generated/prisma/` — Generated Prisma client (gitignored)
  - `src/lib/prisma.ts` — PrismaClient singleton with `@prisma/adapter-pg`
- **Prisma commands** (run from `packages/ns-api/`):
  - `npm run db:migrate:dev` — Create/apply dev migration
  - `npm run db:migrate:deploy` — Apply migrations in production
  - `npm run db:seed` — Run seed script
  - `npm run db:studio` — Open Prisma Studio
- **Env vars**: `DATABASE_URL` (PostgreSQL connection string), `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN` (defaults to `http://localhost:3005`), `OPENAI_API_KEY` (for Whisper audio transcription), `RESEND_API_KEY` (password reset emails), `APP_URL` (frontend URL for email links, defaults to `http://localhost:3005`), `RP_ID` (WebAuthn domain, defaults to `localhost`), `R2_ACCOUNT_ID` (Cloudflare R2 account), `R2_ACCESS_KEY_ID` (R2 API token key), `R2_SECRET_ACCESS_KEY` (R2 API token secret), `R2_BUCKET_NAME` (R2 bucket, `notesync-images`), `R2_PUBLIC_URL` (R2 public domain, `https://notesync-images.derekentringer.com`), `CLAUDE_MODEL` (Claude model ID, defaults to `claude-sonnet-4-6`)
- **Railway start command**: `npm run db:migrate:deploy --workspace=@derekentringer/ns-api && npm run start --workspace=@derekentringer/ns-api`

### NoteSync Mobile (`packages/ns-mobile/`)

- React Native + Expo app for NoteSync on Android/iOS
- **Feature docs**: `docs/ns/mobile/docs/features/` (00–04), progress tracker at `docs/ns/mobile/docs/PROGRESS.md`
- **Feature planning docs**: `docs/ns/mobile/docs/feature_planning/` for planned/in-progress features
- Offline-first with SQLite (full local copy of notes) + FTS5 search
- Same sync protocol as desktop (push → pull with last-write-wins via ns-api)
- Sideload-only distribution (APK for Android, ad-hoc IPA for iOS)
- Android-focused (push notifications on iOS excluded due to paid Apple Developer account requirement)

### Finance Mobile (`packages/fin-mobile/`)

- React Native + Expo app for Finance on Android/iOS
- **Feature docs**: `docs/fin/mobile/docs/features/` (00–09), progress tracker at `docs/fin/mobile/docs/PROGRESS.md`
- **Feature planning docs**: `docs/fin/mobile/docs/feature_planning/` for planned/in-progress features
- 5 bottom tabs: Dashboard, Accounts, Activity, Planning, More
- Dark mode only
- Push notifications via Firebase Cloud Messaging (Android only)

## External Services

- Google Analytics (UA-561217-2) via gtag in `packages/web/index.html`
- Google Fonts (Roboto) loaded via Google Fonts CDN

## Design Assets

- `designs/derekentringer-com/` — PSD source files for portfolio site logos
- `designs/fin-app/fin_logo/` — Finance app logo (original + clean 512px PNG)
