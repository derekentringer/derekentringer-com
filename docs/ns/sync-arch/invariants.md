# Sync Invariants

Post-hardening (Phases 1–3) load-bearing rules. Change any of these and the rest of the system drifts — update this doc + the relevant phase doc at the same time.

This is the contract, not the tour. For the tour (files, tables, protocol shape, asymmetries) see [`00-architecture-reference.md`](00-architecture-reference.md).

---

## 1. Last-write-wins (LWW) semantics

**Server-authoritative.** `/sync/push` does NOT gate on `change.timestamp < existing.updatedAt`. Every non-delete change applies; Prisma's `@updatedAt` stamps server-side arrival order. The last push to arrive wins.

- **Slow/fast client clocks** don't silently drop writes (Phase 2.3). A device with a 1h-slow clock editing a note that a correct-clock device just created still has its write applied, because arrival at the server is what LWW reads.
- **Tradeoff**: a client that has a stale queued edit from weeks ago, flushing after other devices have edited the same note, will overwrite the newer content. This is surfaced to users via the existing rejection/force-push UX for explicit conflicts and accepted as strictly better than the old "silently drop slow-clock writes" behavior.
- **Future**: a per-device Lamport `(deviceId, seq)` counter on each change would give finer-grained causal ordering. Not needed today.

The `force` flag on `SyncChange` no longer has a LWW bypass role (there's nothing to bypass). It now only enables the FK-retry path: on a P2003, retry the insert/update with the orphaning foreign key nulled out.

## 2. Managed-locally flag — `isLocalFile`

`Folder.isLocalFile` and `Note.isLocalFile` mean "backed by an on-disk file on some desktop managing this subtree." Flags are **global, not per-device** — there's no per-desktop attribution.

**Set points (desktop only):**
- `addManagedDirectory` — root folder flipped at registration.
- `resolveFolderForPath` — every folder auto-created to mirror an on-disk subdirectory.
- Keep-local import flow — any folder/note created as part of the import.
- `backfillManagedFolders` — one-time startup sweep walking the tree from each `managed_directories.root_folder_id`, stamping the flag on the root + all descendants.

**Clear points (desktop only):**
- `unmanageManagedDirectory` — clears on the root + every descendant via recursive CTE, enqueues folder sync updates per affected folder, then removes the `managed_directories` row (Phase 3.4).

**Read points:**
- Server REST `DELETE /notes/folders/:id` — always hard-deletes now (regardless of the flag); writes a tombstone. Phase 1.4.
- Web UI `FolderDeleteDialog` — shows a managed-locally warning banner when the flag is true. Phase 1.6.
- Server `/sync/push` folder + `isLocalFile=true` note delete branches — hard-delete + tombstone.

**Not observable:** who the managing desktop is. The flag is a boolean, not a device list. Multiple desktops managing the same folder is undefined behavior (explicitly out of scope).

## 3. Tombstones (`EntityTombstone`)

**Purpose:** hard-deleted rows vanish from `/sync/pull`'s `findMany`. Clients that still have the row locally have no way to learn about the deletion. A tombstone is a lightweight breadcrumb that survives the hard delete.

**Scope:**
- Every folder delete (folders have no restore UI; hard-delete is the only correct outcome).
- Every `isLocalFile=true` note delete from the sync-push path (the on-disk file is presumed gone or about to be trashed).
- Regular note soft-deletes are NOT tombstoned — they ride the existing `deletedAt` column for the trash/restore UX.

**Shape:** `(userId, entityType, entityId, deletedAt)` with `@@unique([userId, entityId])` so re-emits upsert rather than pile up.

**Delivery:** `/sync/pull` returns tombstones alongside changes. Cursor math's per-type `safeAdvance` includes tombstones so a tombstone-capped pull doesn't advance the cursor past undelivered changes or vice versa.

**Client apply order:** note tombstones processed before folder tombstones (Phase 1.5). Ensures a per-note trash move completes before the ancestor managed dir is torn down.

**Sweep:** tombstones are safe to delete once every active `sync_cursor` has advanced past their `deletedAt` (Phase 4.5). Stale cursors (device uninstalled) would block the sweep indefinitely; the existing `cleanupStaleCursors(days = 90)` is run before sweeping.

## 4. Referential deferral (desktop)

SQLite on desktop has **no FK constraints** on columns populated from sync payloads: `folders.parent_id`, `images.note_id`, `notes.folder_id` (migrations 013, 014). Child rows can legitimately arrive before their parents in a sync batch — an FK would reject and the sync engine's catch block would swallow the error, silently losing data.

**The buffer:** `pending_refs` table (migration 017, Phase 3.2). When `upsertNoteFromRemote` sees a `folderId` that isn't in local `folders`, the payload is parked in `pending_refs` instead of being inserted with a dangling pointer. Same for `upsertImageFromRemote` checking `noteId`.

**The drain:** after every successful `upsertFolderFromRemote`, `drainPendingRefsForFolder` replays parked note payloads. After every successful `upsertNoteFromRemote`, `drainPendingRefsForNote` replays parked image payloads. Drain recurses — a drained note can unblock a chain of parked images.

**Entity uniqueness:** `enqueuePendingRef` deletes any prior deferral for the same `(entity_type, entity_id)` before inserting, so retries don't accumulate duplicates.

**Expiry:** `sweepStalePendingRefs(maxAgeDays = 7)` drops permanently-orphaned rows (parent was presumably deleted server-side before ever reaching this client). Called on-demand; no scheduled sweep yet.

**Tables with FKs still make sense:** `NoteLink`, `NoteVersion`, `NoteEmbedding` etc. are populated *locally after* their parent note exists, so FK enforcement is correct. Rule: **if the column's value comes from a sync payload, no FK.**

## 5. Delete matrix

| Origin | Entity | Behavior | Tombstone? |
|---|---|---|---|
| REST `DELETE /notes/:id` | regular note | soft-delete (trash) | no |
| REST `DELETE /notes/:id` | isLocalFile note | hard-delete | yes |
| REST `DELETE /notes/folders/:id` | folder (any) | hard-delete (subtree) | yes (per folder + per hard-deleted note) |
| sync-push `action="delete"` | regular note | soft-delete | no |
| sync-push `action="delete"` | isLocalFile note | hard-delete | yes |
| sync-push `action="delete"` | folder | hard-delete | yes |
| file-watcher-triggered | isLocalFile note | sync-push soft-delete → server hard-deletes + tombstones | yes |

## 6. Cursor pagination

**Keyset on `(updatedAt, id)`** for notes/folders/images and `(deletedAt, entityId)` for tombstones (Phase 2.2).

- Pull request may carry `lastIds: { notes?, folders?, images?, tombstones? }`.
- Per-type query: `(updatedAt > since) OR (updatedAt = since AND id > lastId)` ordered by `(updatedAt ASC, id ASC)`.
- Each per-type query capped at `BATCH_LIMIT=100`.
- Global cursor `lastSyncedAt` advances to `min(safeAdvance across types)`:
  - capped type → `last.updatedAt`
  - drained type → `+Infinity`
- Per-type `lastIds` in the response populated for every type that hit `BATCH_LIMIT`. On the next pull the client passes them back.
- `hasMore = true` iff any type hit `BATCH_LIMIT`.
- All-empty pull advances the cursor to wall-clock `now()` to avoid re-scanning the same empty range.

## 7. SSE notify rules

- `/sync/push` calls `sseHub.notify(userId, deviceId)` after a non-zero `applied` count.
- The originating device is **excluded** from the broadcast. Device A pushing doesn't trigger its own SSE.
- Other devices receive the notify and trigger a `/sync/pull`.

## 8. FK-less columns (server side)

Server-side Prisma schema keeps FKs (it's the source of truth). The FK-less rule applies only to the desktop SQLite.

Server-side `Note.folderRef -> Folder` has `onDelete: SetNull`. A REST-driven folder delete leaves affected notes in-place with `folderId = null` rather than cascading — notes become "unfiled."

## 9. Watcher self-write dedup (desktop)

Writes from the app to a watched file are identified by content hash, not path+timer. `writeLocalFile` records the content hash in `lastWrittenHashByPath` before flushing; the per-file watcher callback drops events whose current-file hash matches (Phase 3.1). External writes with different content pass through even if they land inside the short `suppressedPaths` buffer window.

Identical-content external writes match and are dropped — correct no-op.

## 10. Watcher gap detection (desktop)

Platform watchers (FSEvents, inotify, ReadDirectoryChangesW) can drop events. The 30s poll timer is the backup. When the poll detects a hash change the watcher never reported, it fires `onWatcherGap` which bumps `sync_meta.watcher_gap_count`. Counter is diagnostic-only; no automatic action.

## 11. Sync queue (desktop)

`sync_queue` rows have `action` stored as `"{entityType}:{action}"` (e.g. `"folder:update"`, `"note:delete"`). `note_id` is a misnomer — it's the entity id regardless of type. Historical, not worth renaming.

Queue is drained FIFO into batched `/sync/push` calls. Failures inside a batch return per-change `SyncRejection`s; the client removes only applied entries from the queue and surfaces rejections via `onSyncRejections` callback with force-push + discard action closures.
