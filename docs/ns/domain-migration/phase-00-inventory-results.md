# Phase 0 Inventory — Results

Run date: 2026-05-11
Scope: `packages/ns-*`, `packages/shared`, `CLAUDE.md`. The fin packages and portfolio (`packages/web`, `packages/api`) are out of scope.

This is the discovery output for Phase 0 § I.1–I.5. It feeds directly into Phase 2's rename checklist.

## Summary

| Category | Count | Notes |
|----------|------|-------|
| Files containing `NoteSync` (any case) | **69** | Most concentrated in ns-desktop (Rust + tests) and CLAUDE.md |
| URL refs to `*.derekentringer.com` | **14** lines across 6 files | Three subdomains: `ns.`, `ns-api.`, `notesync-images.` |
| Bundle-ID refs `com.derekentringer.notesync` | **15** lines across 7 files | Includes the new `.dev` variant from the side-by-side work |
| Workspace import scopes | **2** | `@derekentringer/ns-shared`, `@derekentringer/shared/ns` |
| Package.json `name` fields | **6** | All 5 ns-* + `@derekentringer/shared` |
| SQLite filenames | **5** lines, 3 files | `notesync.db` (prod) + `notesync_localhost.db` (dev) |

## Top files by NoteSync hit count

```
CLAUDE.md                                                       29
packages/ns-desktop/src/__tests__/LocalFileDeleteDialog.test    19
packages/ns-desktop/src/__tests__/ImportChoiceDialog.test       19
packages/ns-desktop/src/pages/NotesPage.tsx                     15
packages/ns-desktop/src-tauri/src/audio_capture_shared.rs       13
packages/ns-desktop/src-tauri/src/lib.rs                         7
packages/ns-web/src/lib/db.ts                                    6
packages/ns-mobile/app.config.ts                                 6
packages/ns-desktop/src/components/LocalFileDeleteDialog.tsx     6
packages/ns-desktop/src/components/ImportChoiceDialog.tsx        6
packages/ns-desktop/src-tauri/src/audio_capture.rs               5
packages/ns-shared/src/frontmatter.ts                            4
packages/ns-desktop/src-tauri/tauri.conf.json                    4
packages/ns-desktop/src-tauri/Cargo.toml                         3
packages/ns-api/src/services/emailService.ts                     3
```

Comments and dev-internal references account for most of the high-count files; user-visible strings are concentrated in the JSX/HTML below.

## Categorical breakdown

### C.1 — URL references

These all change as a block. Map:

| Old | New |
|-----|-----|
| `ns.derekentringer.com` | `notate.md` |
| `ns-api.derekentringer.com` | `api.notate.md` |
| `notesync-images.derekentringer.com` | `img.notate.md` |

Locations:

- `CLAUDE.md` — 6 mentions (deployment notes, build commands, env-var docs)
- `packages/ns-api/src/services/linksPreviewService.ts:39` — User-Agent header (`NoteSync-LinkPreview/1.0 (+https://ns.derekentringer.com)`)
- `packages/ns-api/src/__tests__/linksPreviewService.test.ts:42, 364` — test fixture for the R2 link-previews URL
- `packages/ns-desktop/package.json:12, 13` — `tauri:build:prod*` scripts bake `VITE_API_URL=https://ns-api.derekentringer.com`
- `packages/ns-mobile/src/lib/devHost.ts:4` — `PROD_API_URL` constant
- `packages/ns-mobile/src/screens/NoteDetailScreen.tsx:277` — share-URL builder `https://ns.derekentringer.com/notes/${noteId}`

### C.2 — Bundle identifiers

Prod → `md.notate.app`, dev → `md.notate.app.dev` (Phase 0 D.8 / D.9).

Locations:

- `packages/ns-desktop/src-tauri/tauri.conf.json:5` — base `identifier`
- `packages/ns-desktop/src-tauri/tauri.dev.conf.json:4` — dev override
- `packages/ns-desktop/src-tauri/src/lib.rs:24` — `KEYRING_SERVICE` constant
- `packages/ns-desktop/src-tauri/src/audio_capture.rs:315` — macOS aggregate device `CFString("com.derekentringer.notesync.aggregate")` → becomes `md.notate.app.aggregate`
- `packages/ns-desktop/package.json:16` — `tauri:clear-cache` paths (both prod + dev)
- `packages/ns-mobile/app.config.ts:9, 10, 27` — Expo dynamic config (`baseIdentifier`)
- CLAUDE.md — many doc references

iOS app group identifier (from `expo-share-intent` prebuild output, runtime-generated): `group.com.derekentringer.notesync` and `.dev` variant — these regenerate from the bundle ID, no manual file edit needed.

### C.3 — Workspace import scopes

| Old | New |
|-----|-----|
| `@derekentringer/ns-shared` | `@notate/shared` |
| `@derekentringer/shared/ns` (re-export shim from `@derekentringer/shared`) | drop entirely; inline `ns-shared` content into `@notate/shared` per Phase 0 D.7 |
| `@derekentringer/shared` (auth/token subpaths used by ns-api) | `@notate/shared` |

Affects every workspace import across the four packages.

### C.4 — Package.json `name` field

Rename per Phase 0 D.1 / D.3 — drop the `ns-` prefix, scope under `@notate/`:

| Old | New |
|-----|-----|
| `@derekentringer/ns-api` | `@notate/api` |
| `@derekentringer/ns-desktop` | `@notate/desktop` |
| `@derekentringer/ns-mobile` | `@notate/mobile` |
| `@derekentringer/ns-shared` | merged into `@notate/shared` (deleted as a separate package per D.7) |
| `@derekentringer/ns-web` | `@notate/web` |
| `@derekentringer/shared` | `@notate/shared` (with prune per D.7) |

### C.5 — SQLite filenames

The desktop's `dbName.ts` switches between `notesync.db` (prod) and `notesync_localhost.db` (dev) based on `VITE_API_URL`. Mobile has the same pattern in `src/lib/database.ts`. Migration map:

| Old | New |
|-----|-----|
| `notesync.db` | `notate.db` |
| `notesync_localhost.db` | `notate_localhost.db` |

Affected files:
- `packages/ns-desktop/src-tauri/src/lib.rs:415, 416` — Tauri migration registrations (the `sqlite:notesync.db` URI is what the SQL plugin registers)
- `packages/ns-desktop/src/lib/dbName.ts:5, 6`
- `packages/ns-mobile/src/lib/database.ts:11`

**One-time migration**: existing dev installs have a `notesync_localhost.db` file in the app-data container. After the rename, the new app will create a fresh `notate_localhost.db` and won't see the old data unless a startup-time migration copies it across. For a pre-launch single-user posture, simplest is to manually copy the file before the first new build.

### C.6 — Notable UI / branding strings

User-visible:

- `packages/ns-desktop/index.html:6` — `<title>NoteSync</title>`
- `packages/ns-desktop/src-tauri/tauri.conf.json:3` — `"productName": "NoteSync"`
- `packages/ns-desktop/src-tauri/tauri.conf.json:15` — window title
- `packages/ns-desktop/src-tauri/tauri.dev.conf.json:3` — `"productName": "NoteSync (Dev)"`
- `packages/ns-desktop/src-tauri/Cargo.toml:2, 4, 12` — Rust crate `name = "NoteSync"`, `description = "NoteSync Desktop"`
- `packages/ns-desktop/src-tauri/src/lib.rs:375, 381, 382` — macOS app menu "About NoteSync" + "NoteSync" submenu
- `packages/ns-desktop/src/components/AboutDialog.tsx:29` — `<h3>NoteSync</h3>`
- `packages/ns-desktop/src/pages/{ChangePasswordPage,ForgotPasswordPage,...}.tsx` — `<h1>NoteSync</h1>` branding header
- `packages/ns-web/src/pages/LoginPage.tsx` — branding text
- `packages/ns-web/public/site.webmanifest` — `name` / `short_name`
- `packages/ns-mobile/app.config.ts:30` — `name: "NoteSync"` (display name; dev variant is `"NoteSync (Dev)"`)
- `packages/ns-api/src/services/emailService.ts:28` — `<h2>NoteSync</h2>` in email templates
- `packages/ns-api/src/routes/totp.ts:43, 91` + test — TOTP issuer name (the string the authenticator app shows)

Internal/comment references (lower priority, can be a search-and-replace pass):

- `packages/ns-shared/src/frontmatter.ts:4, 7, 23, 29` — doc comments referencing "NoteSync"
- Many test files — fixtures and assertions

### C.7 — Expo `slug` + `scheme`

`packages/ns-mobile/app.config.ts`:

- `slug: "notesync"` → `notate`
- `scheme: "notesync"` → `notate` (deep-link URL scheme)

### C.8 — Tauri Cargo crate

`packages/ns-desktop/src-tauri/Cargo.toml`:

- `[package] name = "NoteSync"` → `notate`
- `[[bin]] name = "NoteSync"` → `notate`
- `description = "NoteSync Desktop"` → `Notate Desktop`

The Rust crate name change cascades to the built binary path in `target/release/`. CI and packaging scripts will need updating.

## Service-account inventory (Phase 0 § I.3)

For each service, captures the **current** (NoteSync, derekentringer-com) state and the **target** (Notate) state. Filled in as we walk through each one.

### Railway

| | Current (NoteSync) | Target (Notate) |
|---|---|---|
| Account | Personal (`derekentringer`) | **New, Notate-specific** — to be created in Phase 1 |
| Services | `ns-api`, `ns-web`, Postgres plugin | None yet — fresh slate |
| Subscription | Shared with derekentringer-com (fin-api, fin-web, web, api) | Separate subscription, billed independently |
| Custom domains | `ns.derekentringer.com` (web), `ns-api.derekentringer.com` (api) | None yet — `notate.md` apex + `api.notate.md` added in Phase 7 |
| Status | ✅ inventoried | 🟡 awaiting account creation (Phase 1 § "Railway") |

### Cloudflare

| | Current (NoteSync) | Target (Notate) |
|---|---|---|
| Account | Personal (same Cloudflare account, no migration needed) | **Same account**, new `notate.md` zone added alongside the existing `derekentringer.com` zone |
| Zones | `derekentringer.com` (with `ns.` + `ns-api.` + `notesync-images.` subdomain DNS records) | `notate.md` (apex + `api.` + `images.` subdomains added in Phase 7) |
| R2 bucket | `notesync-images` | **New bucket `notate-images`** under the same Cloudflare account |
| Bulk Redirects (old → new) | n/a | **None planned** — old `ns.derekentringer.com` / `notesync-images.derekentringer.com` will simply stop resolving after Phase 9. Existing image markdown URLs in notes will 404. Developer will fix broken image refs by hand as encountered. |
| Status | ✅ inventoried | 🟡 new zone + R2 bucket added in Phase 1 / Phase 7 |

### Domain registrars

| Domain | Registrar | DNS managed by |
|--------|-----------|----------------|
| `derekentringer.com` | GoDaddy | Cloudflare (existing) |
| `notate.md` | nic.md (Moldovan TLD registrar) | Cloudflare (per above) |

Notate's domain stays at nic.md (the .md TLD requires a Moldova-registered registrar). DNS is delegated to Cloudflare nameservers — same management pattern as `derekentringer.com`.

### Migration-plan impact: redirect strategy

The original Phase 7 § F + Phase 10 § D specified Cloudflare Bulk Redirects from the old `ns.derekentringer.com` URLs to `notate.md`. Per the decision above, **those redirects are not planned**. Pre-launch single-user posture means the cost of broken old URLs is just "developer hits a broken image and re-uploads." When Phase 7 / 10 doc work resumes, simplify the redirect tasks to "delete old DNS records" only.

### Resend

| | Current (NoteSync) | Target (Notate) |
|---|---|---|
| Account | Shared with derekentringer-com personal account | **New, Notate-specific** Resend account |
| Sender domain | **Not yet configured** — current `ns-api` likely uses Resend's default sandbox sender for password-reset emails | New sender on `notate.md` (DKIM/SPF/DMARC records added to Cloudflare in Phase 1) |
| Plan | Free tier | Free tier (3 k emails/month — plenty for pre-launch single-user) |
| Templates | None live | Re-created with Notate branding |
| Status | ✅ inventoried | 🟡 new account + domain verification in Phase 1 |

> Note: since the current sender domain was never set up, there are no live email-template assets to migrate — Phase 1 starts the Notate Resend setup from scratch with a properly verified `notate.md` sender.

### Anthropic

| | Current (NoteSync) | Target (Notate) |
|---|---|---|
| Account | Shared with derekentringer-com personal account | **New, Notate-specific** Anthropic console account |
| Billing | Existing personal account | Notate-specific billing, separate from derekentringer-com |
| API key | Existing key in old `ns-api` env | **New key** generated under the new account; old key not migrated |
| Model | `claude-sonnet-4-6` (per `CLAUDE_MODEL` env default) | Same — model setting carries over verbatim |
| Status | ✅ inventoried | 🟡 new account + key provisioning in Phase 1 |

### OpenAI → Groq (Whisper provider swap)

Notate is swapping the transcription provider entirely as part of the migration. No OpenAI account at all in the new stack.

| | Current (NoteSync) | Target (Notate) |
|---|---|---|
| Provider | OpenAI Whisper API (`WHISPER_PROVIDER=openai`, default) | **Groq** (`WHISPER_PROVIDER=groq`) |
| Account | Shared with derekentringer-com personal OpenAI account | **New Groq account**, Notate-specific |
| Model | `whisper-1` | `whisper-large-v3-turbo` (Groq's default) |
| Cost | ~$0.006/min | ~6.7× cheaper than OpenAI |
| API key env | `OPENAI_API_KEY` | `WHISPER_API_KEY` (set to Groq key) or `GROQ_API_KEY` (the service falls back to this if `WHISPER_API_KEY` is unset) |
| URL env | `WHISPER_API_URL` defaults to `https://api.openai.com/v1/audio/transcriptions` | Auto-set to `https://api.groq.com/openai/v1/audio/transcriptions` when `WHISPER_PROVIDER=groq` |
| Status | ✅ inventoried | 🟡 new Groq account + key in Phase 1; remove `OPENAI_API_KEY` from new ns-api env entirely |

> **Carry-forward**: `whisperService.ts` is already provider-agnostic — supports `openai`, `groq`, or `custom` via `WHISPER_PROVIDER` config. Swapping is an env-var flip, not a code change, so Notate can switch back to OpenAI (or to a self-hosted whisper.cpp endpoint via `custom`) at any time by:
>
> 1. Provisioning a key with the new provider
> 2. Setting `WHISPER_PROVIDER`, `WHISPER_API_KEY` (and `WHISPER_API_URL` + `WHISPER_MODEL` if `custom`)
> 3. Redeploying — no rebuild needed
>
> Default for Notate launch is Groq; the env-var seam stays in place for future flexibility.

### Voyage AI

| | Current (NoteSync) | Target (Notate) |
|---|---|---|
| Account | Shared with derekentringer-com personal account | **New, Notate-specific** Voyage AI account |
| Use | Embeddings for pgvector semantic search | Same — continue using Voyage |
| API key | `VOYAGE_API_KEY` in old ns-api env | New key under the new account |
| Status | ✅ inventoried | 🟡 new account + key in Phase 1 |

## Production-data inventory (Phase 0 § I.5)

| Resource | Size | Migration plan |
|----------|------|----------------|
| Postgres (ns-api) | **~1.13 GB** (Railway backup size) | `pg_dump` / `pg_restore` per Phase 5; a single-pass dump+restore is fine at this size — no chunking or downtime window beyond the few minutes the dump takes |
| R2 `notesync-images` | **~16 MB** | `aws s3 sync notesync-images → notate-images` per Phase 5; trivially small, completes in seconds |
| Active users | **1** (developer) | Pre-launch, no public coordination needed |

## Documentation references (Phase 0 § I.4)

`CLAUDE.md` is the heaviest — 29 NoteSync mentions, 6 URL mentions, and many `ns-*` package-path references throughout the architecture sections.

`docs/ns/**/*.md` — `git grep` from those directories is also load-bearing but Phase 0's primary inventory focus is package code; docs get their own rewrite pass in Phase 2 § G. Spot-checks show heavy concentration in `docs/ns/architecture/`, `docs/ns/sync-arch/`, `docs/ns/audio-arch/`, `docs/ns/ai-assist-arch/`, `docs/ns/mobile-parity-arch/` — all reference `ns-*` paths in their flow diagrams and prose.

## Carry-forward — items NOT touched by simple find-and-replace

Picking these out so they don't get missed during Phase 2's mechanical rewrite:

1. **Tauri Cargo crate name** — changes the binary path in `target/release/`. CI / packaging / Tauri's `tauri:version-sync` script implicitly relies on the binary name; verify after the rename.
2. **TOTP issuer string** — `"NoteSync"` shows up in users' authenticator apps. Changing it doesn't break existing TOTP codes (those are tied to the secret, not the issuer label), but the label in the authenticator entry won't auto-update — users need to re-pair, or accept a stale label.
3. **Email templates** — `<h2>NoteSync</h2>`. Re-craft via Resend in Phase 1 with Notate branding; the source-code template strings update in Phase 2.
4. **macOS aggregate-device `CFString`** — `com.derekentringer.notesync.aggregate` is created at runtime via CoreAudio when meeting-mode recording starts. Old aggregate devices may linger in CoreAudio's state until next system reboot; ignore for migration purposes.
5. **WebKit / TCC cache paths** — `~/Library/Caches/com.derekentringer.notesync/` etc. After the rename, fresh paths under `~/Library/Caches/md.notate.app/`. Old caches stick around until manually cleared. The `tauri:clear-cache` script already references both prod and dev paths; update to the new identifier in Phase 2.
6. **iOS share-extension app group** — `group.com.derekentringer.notesync` (and `.dev`). Regenerated automatically by `expo-share-intent` from the bundle ID during prebuild; no manual file edit needed, but worth verifying after Phase 2's `expo prebuild --clean`.

## Done criteria for this inventory

- [x] All four `git grep` passes from Phase 0 § I.1 completed
- [x] Bundle-ID inventory (§ I.2) captured
- [x] Service-account inventory (§ I.3) — all services captured (Railway, Cloudflare, Resend, Anthropic, OpenAI→Groq, Voyage AI)
- [x] Documentation references (§ I.4) — captured at the summary level; deeper sweep deferred to Phase 2 § G
- [x] Production-data inventory (§ I.5) — Postgres ~1.13 GB, R2 ~16 MB; small enough for single-pass dump/restore + sync
