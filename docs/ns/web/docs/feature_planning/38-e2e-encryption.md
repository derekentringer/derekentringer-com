# 38 — End-to-End Encryption

**Status:** Planned
**Phase:** Phase 3 — Differentiation
**Priority:** High

## Summary

Encrypt note content client-side so the server never sees plaintext. This is the #1 reason users choose Standard Notes. Critical for positioning as a privacy-focused alternative.

## Architecture

### Encryption Scheme

- **Algorithm:** AES-256-GCM (same as existing field-level encryption in fin-api)
- **Key derivation:** PBKDF2 or Argon2 from user's password → master key
- **Per-note keys:** Each note encrypted with a unique key, wrapped by the master key
- **What's encrypted:** Note title, content, tags
- **What's NOT encrypted:** Note ID, timestamps, folder structure, sync metadata (needed for server-side operations)

### Key Management

- Master key derived from password on login, held in memory only
- Master key never sent to server, never stored in localStorage
- Key rotation: if user changes password, re-encrypt all note keys with new master key
- Recovery: without password, notes are unrecoverable (by design — zero-knowledge)

### Sync Compatibility

- Encrypted content syncs as opaque blobs via existing push/pull
- Server stores ciphertext — can still do conflict detection via timestamps
- Search becomes client-side only (server can't index encrypted content)
- AI features work on client-side decrypted content (API calls send plaintext to Claude — user must understand this tradeoff)

### Migration Path

- Existing unencrypted notes → opt-in encryption per vault/account
- "Enable encryption" in settings → derives key, encrypts all notes, uploads ciphertext
- Cannot undo (by design — once encrypted, always encrypted)
- Warning: "If you forget your password, your notes cannot be recovered"

## Challenges

1. **Search:** Server-side full-text search won't work on encrypted notes. Need client-side FTS (already exists on desktop/mobile with SQLite FTS5). Web needs IndexedDB-based search.
2. **AI features:** Sending decrypted content to Claude API means content leaves the device. Need clear disclosure: "AI features send your note content to Anthropic's API."
3. **Sharing:** Shared notes need a separate encryption key that the recipient can access. Complex key exchange problem.
4. **Performance:** Encrypting/decrypting on every edit adds latency. Batch operations during sync.
5. **Collaboration (future):** E2E encryption makes real-time collaboration extremely difficult. May need to be mutually exclusive with encryption.

## Implementation Phases

1. **Client-side crypto library** — key derivation, encrypt/decrypt functions
2. **Encrypt on write, decrypt on read** — transparent layer in sync engine
3. **Client-side search** — IndexedDB FTS for web (desktop/mobile already have SQLite FTS)
4. **Migration tool** — encrypt existing notes
5. **Key change** — re-encryption on password change

## Verification

- Notes encrypted before leaving the device (verify with network inspector)
- Server database contains only ciphertext
- Login with correct password → notes decrypt and display
- Login with wrong password → notes unreadable
- Password change re-encrypts all notes
- Search works on encrypted notes (client-side)
- Sync works correctly with encrypted content
- AI features work with appropriate disclosure
