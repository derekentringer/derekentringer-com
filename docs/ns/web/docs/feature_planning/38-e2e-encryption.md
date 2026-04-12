# 38 — End-to-End Encryption

**Status:** Planned
**Priority:** High

## Summary

Client-side encryption so the server never stores plaintext note content. Users opt in per-account and choose one of three privacy tiers that control how (or whether) AI features interact with encrypted data. Once enabled, encryption is irreversible.

## Privacy Tiers

Users who enable E2E encryption choose one of three modes:

| Mode | AI Features | Search | Server Sees Plaintext |
|---|---|---|---|
| **E2E + Server Relay** | Most (chat, summarize, tags, rewrite, transcription structuring) | Keyword only | Transiently in memory — never stored |
| **E2E + BYOK Direct** | Most (same as relay, using user's own API keys) | Keyword only | Never |
| **E2E + No AI** | None | Keyword only | Never |

Users without encryption enabled continue to get the full feature set including semantic search, meeting context, and image AI descriptions.

### Mode Details

**E2E + Server Relay:**
- Client decrypts note content in the browser, sends plaintext to NoteSync AI endpoints
- Server forwards to Claude/Whisper/Voyage using NoteSync's API keys
- Server processes the request, returns the result, discards the plaintext immediately
- Plaintext is never written to database, logs, or disk
- Clear disclosure: "Your decrypted content passes through our server to reach AI providers but is never stored"

**E2E + BYOK Direct:**
- Client decrypts note content and calls Claude/Whisper APIs directly from the browser
- User provides their own API keys (stored encrypted client-side)
- NoteSync server is never involved in AI calls — only sync of encrypted blobs
- Requires: client-side AI SDK (Anthropic JS SDK, OpenAI JS SDK)

**E2E + No AI:**
- Maximum privacy — no decrypted content ever leaves the device except as encrypted sync blobs
- All AI features disabled (greyed out with explanation)
- Local keyword search only

## Encryption Architecture

### Scheme

- **Algorithm:** AES-256-GCM
- **Key derivation:** Argon2id from user's password → master key (Argon2id preferred over PBKDF2 for resistance to GPU attacks)
- **Per-note keys:** Each note encrypted with a unique data encryption key (DEK), DEK wrapped by the master key
- **What's encrypted:** Note title, note content, tags, image data, AI descriptions
- **What's NOT encrypted:** Note ID, folder ID, folder names, timestamps, sync cursors, user metadata (needed for server-side sync operations)

### Key Management

- Master key derived from password on login, held in memory only
- Master key never sent to server, never persisted to localStorage or IndexedDB
- Per-note DEKs stored wrapped (encrypted by master key) alongside the note
- Key rotation on password change: re-wrap all DEKs with new master key (re-encrypting DEKs is fast; no need to re-encrypt all note content)
- **Zero knowledge:** Without the password, notes are unrecoverable by design

### Sync Compatibility

- Encrypted notes sync as opaque blobs through existing push/pull endpoints
- Server stores ciphertext — conflict detection still works via timestamps
- Encrypted notes are larger (IV + auth tag overhead per field) — minimal impact
- SSE notifications unchanged (they carry IDs and timestamps, not content)

## Feature Impact

### Fully Working with Encryption

- Note editing (encrypt on save, decrypt on load — transparent to editor)
- Folders and folder structure (folder names stay unencrypted for server-side tree operations)
- Wiki-links and backlinks (resolved client-side against decrypted titles)
- Cross-device sync (encrypted blobs through existing SSE push/pull)
- Audio recording and Whisper transcription (audio is not an encrypted note — transcription happens before encryption)
- Version history (encrypted snapshots — client decrypts to display)
- Local keyword search (decrypt notes client-side, search in memory or via IndexedDB FTS)
- Slash commands that don't read content (/stats, /folders, /tags)
- Chat history (messages stored encrypted)

### Disabled with Encryption

- **Semantic search** — pgvector cannot index encrypted content. Embeddings leak content meaning and cannot be stored. Falls back to keyword search only.
- **Meeting context / related notes during recording** — relies on pgvector similarity search server-side. Disabled.
- **Image AI descriptions** — server cannot analyze encrypted images. Disabled (images still upload/sync as encrypted blobs).
- **Server-side full-text search** — falls back to client-side keyword search.

### Available Depending on Tier

- **AI chat, summarize, tags, rewrite** — available in Server Relay and BYOK Direct modes, disabled in No AI mode
- **Transcription structuring** (Whisper output → structured note) — available in Server Relay and BYOK Direct modes
- **AI tools that read notes** (search_notes, get_note_content, etc.) — client must decrypt and provide content; available in Relay/BYOK modes

## Migration Path

### Enabling Encryption (One-Way)

1. User navigates to Settings → Security → "Enable End-to-End Encryption"
2. Warning dialog: "This cannot be undone. If you forget your password, your notes are permanently unrecoverable. There is no recovery mechanism."
3. User confirms and enters password
4. Client derives master key via Argon2id
5. Client generates a DEK for each note, encrypts note content, wraps DEK with master key
6. Client pushes all encrypted notes via sync (replaces plaintext on server)
7. Server deletes: all embeddings for this user, all AI descriptions, all plaintext search indexes
8. User selects privacy tier (Server Relay / BYOK Direct / No AI)

### Irreversibility

- Once enabled, there is no "disable encryption" option
- The server never had the master key — it cannot decrypt notes to restore plaintext
- If the user loses their password, notes are gone
- The privacy tier can be changed at any time (e.g., switch from No AI to Server Relay)
- A user could manually export decrypted notes (client-side) and create a new unencrypted account, but the account-level setting is permanent

### Password Change

- User enters old password + new password
- Client derives old master key, unwraps all DEKs
- Client derives new master key, re-wraps all DEKs
- DEKs are small (~256 bits each) — re-wrapping is near-instant even for thousands of notes
- Note content is not re-encrypted (DEKs stay the same, only the wrapping changes)

## Client-Side Search (Encrypted Mode)

Since the server cannot index encrypted content, search must happen client-side:

### Web (IndexedDB FTS)

- On login, decrypt all notes and build an in-memory or IndexedDB-backed keyword index
- Incremental updates: re-index individual notes on edit
- Limitation: large libraries (10,000+ notes) may have slow initial index build
- Consider Web Workers for background indexing

### Desktop (SQLite FTS5)

- Already has full FTS5 search on local SQLite — no change needed
- Decrypted content is indexed locally, never leaves the device
- Best search experience of all platforms

### Mobile (SQLite FTS5)

- Same as desktop — SQLite FTS5 already exists
- No changes needed for keyword search

## Client-Side BYOK Direct Implementation

For the BYOK Direct tier, the client needs to call AI APIs directly:

- Bundle Anthropic JS SDK and OpenAI JS SDK as optional dependencies
- User enters API keys in Settings → AI Providers (stored encrypted in the local database, never sent to server)
- AI requests go directly from browser/desktop/mobile to Claude/Whisper endpoints
- CORS: Anthropic and OpenAI APIs support browser requests with API keys
- No credit metering possible (user pays their own API costs directly)

## API Changes

### New Endpoints

- `POST /auth/encryption/enable` — marks user account as encrypted, server deletes plaintext data (embeddings, AI descriptions, search indexes)
- `GET /auth/encryption/status` — returns `{ enabled: boolean, tier: 'relay' | 'byok' | 'none' | null }`
- `PATCH /auth/encryption/tier` — update privacy tier selection

### Modified Endpoints

- AI endpoints (`/ai/*`) — when encryption is enabled and tier is `relay`, accept plaintext content in request body (transient processing), enforce no-persist policy
- AI endpoints — when tier is `none`, reject with 403 and message explaining encryption mode
- Sync endpoints — no changes needed (encrypted blobs are just strings)
- Search endpoints — when encrypted, return empty results with a flag indicating client-side search should be used

### No-Persist Policy (Server Relay Mode)

- AI route handlers must never write request body content to database, file, or log
- Request logging must redact note content fields for encrypted users
- Error logging must not include note content
- Consider an in-memory-only request context that is explicitly cleared after response

## Implementation Phases

### Phase 1: Core Encryption

- Argon2id key derivation (use `argon2-browser` / `hash-wasm` library)
- AES-256-GCM encrypt/decrypt utilities
- DEK generation and wrapping
- Encrypt/decrypt layer in sync engine (transparent to rest of app)
- Settings UI: enable encryption flow with warnings
- Account encryption status on server
- Server cleanup on enable (delete embeddings, AI descriptions)

### Phase 2: Client-Side Search

- Web: IndexedDB keyword search with Web Worker indexing
- Verify desktop/mobile FTS5 works with decrypted content (should already work)
- Search UI: show "Keyword search only" indicator when encrypted

### Phase 3: Privacy Tiers

- Server Relay: no-persist AI endpoint handling
- BYOK Direct: client-side Anthropic/OpenAI SDK integration
- No AI: disable AI features in UI
- Settings UI: tier selection and explanation

### Phase 4: Hardening

- Key rotation on password change
- Audit logging (encryption enabled/disabled events)
- Security review of no-persist guarantees
- Penetration testing of encryption boundaries
- Documentation for users

## Verification

- Enable encryption → all notes encrypted before leaving device (verify with network inspector)
- Server database contains only ciphertext for encrypted users
- Login with correct password → notes decrypt and display normally
- Login with wrong password → notes unreadable, clear error message
- Password change → re-wrap succeeds, all notes still accessible
- Semantic search disabled, keyword search works (all platforms)
- Server Relay: AI features work, no content persisted on server
- BYOK Direct: AI calls go directly to provider APIs (verify with network inspector)
- No AI: all AI features disabled with clear messaging
- Sync works correctly with encrypted content across devices
- Version history displays decrypted snapshots
- Wiki-links and backlinks resolve correctly
- New device login → notes decrypt after entering password
