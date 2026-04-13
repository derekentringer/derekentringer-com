# 09 — End-to-End Encryption

**Status:** Planned
**Priority:** High

## Summary

Client-side encryption for the mobile app. Like desktop, mobile benefits from SQLite FTS5 for local search. The implementation mirrors the web (see [web feature plan 38](../../../web/docs/feature_planning/38-e2e-encryption.md)) with mobile-specific crypto and storage considerations.

## Privacy Tiers

Same three tiers — user selects in Settings → Security:

| Mode | AI Features | Search | Server Sees Plaintext |
|---|---|---|---|
| **E2E + Server Relay** | Most (chat, summarize, tags, rewrite, transcription structuring) | Full local FTS5 keyword search | Transiently in memory — never stored |
| **E2E + BYOK Direct** | Most (same, using user's own API keys) | Full local FTS5 keyword search | Never |
| **E2E + No AI** | None | Full local FTS5 keyword search | Never |

## Mobile-Specific Architecture

### Crypto Libraries

- **React Native:** Use `react-native-quick-crypto` (native C++ bindings to OpenSSL) for AES-256-GCM
- **Argon2id:** Use `react-native-argon2` (native implementation, not JS/WASM)
- Avoid pure-JS crypto — too slow on mobile for bulk encryption during migration

### Key Storage

- Master key derived from password on login, held in memory only
- **Expo SecureStore** for encrypted session tokens and BYOK API keys (iOS Keychain / Android Keystore backed)
- Wrapped DEKs stored in SQLite alongside encrypted note rows
- On app backgrounding: master key stays in memory (cleared on process kill)
- On biometric unlock (if implemented later): could cache master key in SecureStore for faster re-derive

### SQLite Integration

- Same as desktop: encrypted columns in notes table
- FTS5 index operates on decrypted content locally — keyword search unchanged
- On load: decrypt note from SQLite → display
- On save: encrypt content → store in SQLite + push encrypted blob via sync

### Sync Engine Changes

- Same as desktop: push/pull encrypted blobs, conflict detection via timestamps
- Background sync (if implemented): operates on encrypted blobs only — no decryption needed for transport

### Migration (Enable Encryption)

1. Settings → Security → Enable E2E Encryption
2. Warning dialog (irreversible, no recovery)
3. Derive master key, generate DEKs, encrypt all notes in SQLite
4. Push encrypted notes via sync
5. Server cleanup (embeddings, AI descriptions)
6. FTS5 index rebuilt locally from decrypted content
7. Show progress indicator — mobile migration may be slower (battery/CPU constraints)

## Feature Impact (Mobile-Specific)

### No Change

- Local keyword search (FTS5 on decrypted content)
- Note browsing and editing
- Folders, tags, wiki-links, backlinks
- Offline mode
- Sync

### Disabled

- Semantic search (pgvector)
- Meeting context / related notes
- Image AI descriptions

### Tier-Dependent

- AI chat, summarize, tags, rewrite — Relay and BYOK modes
- Audio transcription structuring — Relay and BYOK modes (when mobile AI is implemented)

### Not Yet Applicable

Mobile currently has no AI features (planned for Phase 2 of the business roadmap). When mobile AI is added, it should respect the encryption tier from the start. The encryption setting syncs from the server — if a user enables encryption on web/desktop, mobile automatically operates in encrypted mode on next sync.

## BYOK Direct (Mobile)

- API keys stored in Expo SecureStore
- Direct API calls to Claude/Whisper from the app using `fetch()`
- No CORS issues (native app, not browser)
- Simpler than web — no SDK bundling needed, just REST calls

## Performance Considerations

- **Migration speed:** Encrypting thousands of notes on a phone may take time. Show progress bar, allow backgrounding.
- **Battery impact:** Argon2id key derivation is intentionally CPU-intensive. Run on login only, not on every note open.
- **Memory:** DEK cache in memory for recently accessed notes to avoid repeated unwrap operations
- **Large notes:** Stream encryption for notes over ~1MB to avoid memory spikes

## Implementation Phases

### Phase 1: Core Encryption

- Install and configure `react-native-quick-crypto` and `react-native-argon2`
- Encrypt/decrypt utilities (AES-256-GCM, DEK wrap/unwrap)
- SQLite schema migration for encrypted columns
- Encrypt/decrypt layer in sync engine
- Settings UI: enable encryption with warnings
- FTS5 rebuild

### Phase 2: Privacy Tiers

- Server Relay: send decrypted content to NoteSync AI endpoints (when mobile AI exists)
- BYOK Direct: direct API calls with SecureStore keys
- No AI: disable AI features
- Settings UI: tier selection

### Phase 3: Hardening

- Password change → re-wrap DEKs
- Biometric unlock consideration (cache key derivation result)
- Audit: no decrypted content in logs, crash reports, AsyncStorage, or temp files
- Test on low-end Android devices for performance

## Verification

- Same as web/desktop verification checklist
- Additional: test migration on device with 500+ notes (performance)
- Verify SecureStore correctly stores/retrieves BYOK keys
- Verify FTS5 search works in encrypted mode
- Verify app backgrounding doesn't lose master key (process not killed)
- Verify encryption setting syncs from server (enable on web → mobile picks it up)
- Verify offline mode works with encrypted notes
