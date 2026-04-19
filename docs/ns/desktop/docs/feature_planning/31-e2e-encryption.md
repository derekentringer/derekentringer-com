# 31 — End-to-End Encryption

**Status:** Planned
**Priority:** High

## Summary

Client-side encryption for the desktop app. The desktop is the strongest platform for E2E encryption — SQLite provides local FTS5 search, Tauri's keyring offers secure key storage, and native Rust crypto libraries are fast. The implementation mirrors the web (see [web feature plan 38](../../../web/docs/feature_planning/38-e2e-encryption.md)) with desktop-specific storage and crypto optimizations.

## Privacy Tiers

Same three tiers as web — user selects in Settings → Security:

| Mode | AI Features | Search | Server Sees Plaintext |
|---|---|---|---|
| **E2E + Server Relay** | Most (chat, summarize, tags, rewrite, transcription structuring) | Full local FTS5 keyword search | Transiently in memory — never stored |
| **E2E + BYOK Direct** | Most (same, using user's own API keys) | Full local FTS5 keyword search | Never |
| **E2E + No AI** | None | Full local FTS5 keyword search | Never |

## Desktop-Specific Architecture

### Key Storage

- Master key derived from password via Argon2id on login
- Master key held in memory only (Rust side via Tauri state)
- Wrapped DEKs stored in SQLite alongside encrypted note rows
- **Tauri keyring** (`keyring` crate): optionally cache a key-derivation salt or session token for faster unlock — never store the master key itself

### SQLite Integration

- Encrypted notes stored as ciphertext in the `notes` table (`title_encrypted`, `content_encrypted` BLOB columns)
- On load: Rust decrypt → pass plaintext to frontend → display in editor
- On save: frontend sends plaintext → Rust encrypt → store in SQLite + push encrypted blob via sync
- **FTS5 index operates on decrypted content locally** — this is the key advantage over web. Desktop keyword search works identically to unencrypted mode.
- FTS5 index is local-only and never synced

### Crypto Implementation

- Use Rust `ring` or `aes-gcm` crate for AES-256-GCM (faster than WASM/JS crypto)
- Argon2id via `argon2` crate for key derivation
- Tauri commands: `derive_key(password) → master_key`, `encrypt(plaintext, dek) → ciphertext`, `decrypt(ciphertext, dek) → plaintext`, `wrap_dek(dek, master_key) → wrapped`, `unwrap_dek(wrapped, master_key) → dek`
- Frontend calls these via Tauri `invoke()` — crypto never runs in JS

### Sync Engine Changes

- `syncEngine.ts` push: read encrypted blobs from SQLite, push as-is (no re-encryption needed)
- `syncEngine.ts` pull: receive encrypted blobs from server, store in SQLite, decrypt for display
- Conflict detection unchanged (timestamp-based)
- Sync payloads are slightly larger (IV + auth tag per field) — negligible

### Migration (Enable Encryption)

1. User goes to Settings → Security → Enable E2E Encryption
2. Warning dialog (same as web — irreversible, no recovery without password)
3. Rust side: derive master key, generate DEK per note, encrypt all notes in SQLite
4. Push all encrypted notes via sync (server replaces plaintext with ciphertext)
5. Server deletes embeddings, AI descriptions, search indexes for this user
6. FTS5 index rebuilt from decrypted content (local-only, unchanged behavior)

### Audio Recording

- Native CoreAudio recording is unaffected — audio is recorded locally, sent to Whisper for transcription
- The resulting transcript text is encrypted before being stored as a note
- In Server Relay mode: transcript structuring works (client sends decrypted transcript to server AI endpoint)
- In BYOK Direct mode: client calls Claude API directly to structure the transcript
- In No AI mode: raw Whisper transcript saved as the note (no Claude structuring)

## Feature Impact (Desktop-Specific)

### No Change from Unencrypted

- Local keyword search (FTS5 indexes decrypted content locally)
- Wiki-links and backlinks (resolved locally against decrypted titles)
- Note editing experience (decrypt on load, encrypt on save — transparent)
- Audio recording and transcription
- Offline mode (SQLite has all encrypted data + decrypted FTS index)

### Disabled (Web Only)

- Semantic search / pgvector on web (server can't generate embeddings from ciphertext; web has no local database for embeddings)
- Image AI descriptions on web (server can't analyze encrypted images)

### Disabled (All Platforms)

- Image AI descriptions via server (server can't analyze encrypted images)

### Desktop-Only: Semantic Search Under E2E

Desktop retains semantic search even with E2E encryption enabled, because the desktop has decrypted content locally and can generate embeddings client-side:

- **BYOK Direct mode**: Desktop calls the embedding API directly with the user's own API key, generates vectors from decrypted content, stores them in the local `note_embeddings` SQLite table. Cosine similarity search runs entirely locally. The server's pgvector index is empty for encrypted users, but the desktop's local index covers it.
- **Server Relay mode**: Desktop sends decrypted content to ns-api for embedding generation (content is transiently in memory, same as other Relay AI features). Embeddings returned and stored locally.
- **No AI mode**: Semantic search disabled (no embedding generation without AI). Keyword search via FTS5 still works.

Meeting context / related notes also work on desktop under BYOK Direct and Server Relay modes since they rely on the same embedding infrastructure.

### Tier-Dependent

- AI chat, summarize, tags, rewrite — Relay and BYOK modes
- Transcription structuring — Relay and BYOK modes

## BYOK Direct (Desktop)

- Anthropic and OpenAI JS SDKs loaded in the Tauri WebView
- API keys stored in Tauri keyring (OS-level secure storage)
- AI requests go from WebView → directly to Claude/Whisper APIs
- Alternative: route through Rust side using `reqwest` for API calls (avoids CORS, keeps keys in Rust memory)

## Implementation Phases

### Phase 1: Core Encryption

- Rust crypto module: Argon2id, AES-256-GCM, DEK wrap/unwrap
- Tauri commands for encrypt/decrypt/derive
- SQLite schema changes: encrypted columns alongside plaintext (migration)
- Encrypt/decrypt layer in sync engine
- Settings UI: enable encryption flow
- FTS5 rebuild from decrypted content

### Phase 2: Privacy Tiers

- Server Relay: send decrypted content to NoteSync AI endpoints (same as current, but explicitly transient)
- BYOK Direct: client-side API calls via reqwest or JS SDK
- No AI: disable all AI UI elements
- Settings UI: tier selection

### Phase 3: Hardening

- Password change → re-wrap DEKs via Rust
- Keyring integration for session management
- Audit: ensure no decrypted content leaks to logs, crash reports, or temp files
- Verify FTS5 index doesn't persist after app data wipe

## Verification

- Same as web verification checklist
- Additional: Rust crypto module unit tests (encrypt → decrypt roundtrip, wrong key rejection, DEK wrap/unwrap)
- Verify FTS5 search works identically in encrypted and unencrypted modes
- Verify Tauri keyring stores/retrieves correctly on macOS
- Verify offline mode works with encrypted notes (no network needed to read/edit)
- Network inspector: encrypted sync payloads contain no plaintext
