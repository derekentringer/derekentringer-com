# Architecture Reference (Current State)

Snapshot of the two sync systems as they exist today. This is the baseline the hardening phases build on.

## Two sync systems

### 1. Cross-platform cloud sync (desktop + mobile ↔ ns-api)

Offline-first with a durable local queue. Last-write-wins with structured rejection.

- **Wire**: `POST /sync/push`, `POST /sync/pull`, `GET /sync/events` (SSE wake-up)
- **Entities**: `note`, `folder`, `image` — each has an `id`, `action` (`create` | `update` | `delete`), `data`, `timestamp`, optional `force`
- **Conflict model**: server compares `change.timestamp` to `existing.updatedAt`; older writes return `timestamp_conflict` unless `force: true`
- **Rejection reasons**: `fk_constraint`, `unique_constraint`, `not_found`, `timestamp_conflict`, `unknown`

Key files:

| File | Role |
|---|---|
| `packages/ns-api/src/routes/sync.ts` | Push/pull/SSE handlers, cursor math, FK-null force-retry |
| `packages/ns-api/src/store/syncStore.ts` | `getNotesChangedSince`, `getFoldersChangedSince`, `getImagesChangedSince` |
| `packages/ns-api/src/lib/sseHub.ts` | Per-user SSE connection registry; `notify(userId, excludeDeviceId)` already excludes the originator |
| `packages/ns-desktop/src/lib/syncEngine.ts` | Desktop sync client |
| `packages/ns-mobile/src/lib/syncEngine.ts` | Mobile sync client (XHR-based SSE for React Native) |
| `packages/ns-shared/src/types.ts` | Wire types (`SyncChange`, `SyncPushRequest`, `FolderSyncData`, `ImageSyncData`) |

Client push flow:

1. Read sync queue (capped at `BATCH_LIMIT = 100`)
2. Deduplicate by `(entity_type, entity_id)` — last entry wins
3. Sort: folder create/update → notes → folder delete (FK ordering)
4. POST to `/sync/push`
5. On `rejections[]`, remove only applied entries, surface per-change rejections to UI with `forcePush` / `discard` action closures
6. Reset backoff on success; exponential backoff (max 60s) on error

Client pull flow:

1. POST `/sync/pull` with `since = lastPullAt`
2. Apply changes in type order (folder → note → image) to respect FK ordering within batch
3. Update cursor to server-returned `lastSyncedAt`
4. If `hasMore`, pull again

Server pull cursor math (`sync.ts:255-274`):

- Each type query capped at `BATCH_LIMIT`; orderBy `updatedAt ASC`
- "Safe advance" per type = last item's `updatedAt` if capped, else `+Infinity`
- Global cursor = `min(safeAdvance)` — never advances past an un-drained type's boundary
- `hasMore = any type hit BATCH_LIMIT`

### 2. Desktop local-file sync (Tauri only)

Links notes to markdown files on disk. Can auto-index a whole directory tree as "managed".

- **State**: `managed_directories` SQLite table maps disk paths → root folder IDs
- **Watchers**: per-file + recursive per-directory `watch()` via Tauri's fs plugin
- **Debounce**: 200ms per-path
- **Polling backup**: 30s `pollTimer` for individual watched files
- **Reconciliation**: 10s `DIR_RECONCILE_INTERVAL_MS` for managed directories
- **Hashing**: SHA-256 content hash detects external edits and self-write suppression

Key files:

| File | Role |
|---|---|
| `packages/ns-desktop/src/lib/localFileService.ts` | Watchers, reconciliation, auto-index, `writeLocalFile` suppression |
| `packages/ns-desktop/src/lib/db.ts` | SQLite access: notes, folders, sync queue, managed_directories, `resolveFolderForPath` |
| `packages/ns-desktop/src-tauri/migrations/*.sql` | SQLite schema history |
| `packages/ns-desktop/src-tauri/src/lib.rs` | Native `move_to_trash` command, migration registration |

Self-write suppression (`localFileService.ts:27-30`):

```
suppressedPaths: Set<string>
writeLocalFile(): add → write → 100ms delay → delete
```

Watcher callbacks check `suppressedPaths.has(path)` and drop self-events. Time-window based — vulnerable to TOCTOU when external writes land inside the window (Phase 3 addresses this with hash-based dedup).

## Web (REST + IndexedDB, not sync protocol)

Load-bearing asymmetry: `ns-web` does **not** use `/sync/push|pull`. Instead:

- `packages/ns-web/src/api/offlineNotes.ts` — REST calls with IndexedDB cache fallback when `!navigator.onLine`
- `packages/ns-web/src/lib/offlineQueue.ts` — offline write queue, flushed on reconnect
- `packages/ns-web/src/hooks/useOfflineCache.ts` — queue flush with 3× transient-retry

Consequence: web has weaker conflict handling than desktop/mobile. No structured rejection surface, no force-push/discard UI, no multi-device offline sync. This is intentional for now; Phase 6 revisits it.

## Schemas

### Server (Prisma — `packages/ns-api/prisma/schema.prisma`)

Relevant tables: `User`, `Note`, `Folder`, `Image`, `NoteLink`, `NoteVersion`, `SyncCursor`, `ChatMessage`, `Passkey`, `PasswordResetToken`, `RefreshToken`, `Setting`.

- `Note.isLocalFile` exists and is synced across wire
- `Folder` has no `isLocalFile` equivalent (Phase 1 adds it)
- `Image` has no `isLocalFile` equivalent (currently not needed)
- `SyncCursor` = `(userId, deviceId) → lastSyncedAt`

### Desktop SQLite (`packages/ns-desktop/src-tauri/migrations/`)

15 migrations. Notable:

- `011` — images table with FK on `note_id`
- `013` — dropped FK `folders.parent_id → folders.id`. Sync arrival order could violate it; errors were being swallowed by the sync engine's try/catch, silently losing data.
- `014` — dropped FK `images.note_id → notes.id` for the same reason. Concrete bug: 8 images referencing a note beyond batch boundary all failed to insert.
- `015` — `managed_directories` table.

**Load-bearing rule**: columns populated from sync payloads (`folders.parent_id`, `images.note_id`, `notes.folder_id`) must NOT have FK constraints. Derived-data tables populated locally after sync (`note_links`, `note_versions`, `note_embeddings`) can keep FKs.

## Invariants (documented)

- Folder creates/updates precede note creates/updates in push; folder deletes come last (FK ordering).
- Pull applies folders → notes → images in type order (FK ordering within batch).
- Server hard-deletes folders in the sync path (`sync.ts:451`); REST path soft-deletes (`noteStore.ts:931`). **This asymmetry is Phase 1's explicit target.**
- Server hard-deletes `isLocalFile` notes (`sync.ts:323`); soft-deletes the rest into NoteSync trash.
- SSE `notify` excludes the originating device (`sseHub.ts:105`).

## Invariants (implicit; Phase 4 will document)

- LWW tie-break rules under identical timestamps (undefined today).
- Behavior when sync payload references a not-yet-synced parent (silently accepted as orphan today).
- Lifecycle of `managed_directories` rows when their root folder is deleted remotely (no handler today).
