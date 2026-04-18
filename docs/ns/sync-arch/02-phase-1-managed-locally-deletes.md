# Phase 1 — Managed-Locally Delete Consistency

**Status**: ✅ Complete (commits `66d6aeb`…`bc39807` on `develop-sync-arch-hardening`)

## Goal

Kill the soft-delete ambiguity for folders (and descendant notes) that are backed by on-disk files. When a user deletes a managed-locally folder — whether from web, desktop, or mobile — the outcome should be deterministic and match user expectation: on-disk files move to OS trash on the managing desktop, and the folder is fully removed from the cloud.

## Design note: tombstones (added after planning)

The original plan had the server hard-delete managed folders on the REST path. While implementing, we discovered hard-deletes on the server don't propagate via `/sync/pull` — the row is gone before clients can observe it, so desktops never learn to clean up on-disk directories.

The zombie-folder problem you flagged separately (deleted-and-soft-preserved folders colliding with re-creation under the same name) made soft-delete unattractive regardless. Solution: **hard-delete + tombstone** — the server hard-deletes the row AND writes an `EntityTombstone`. Pull returns tombstones alongside changes so every client learns about the deletion and can clean up. Scoped to folders (no folder restore UI) and `isLocalFile` notes (the sync-push path already hard-deletes these); regular-note soft-deletes keep driving the web trash/restore UX.

Sweep for accumulated tombstones is Phase 4 (option a: delete after every active `sync_cursor` has advanced past the tombstone's `deletedAt`).

## Why this matters

Today the server has no knowledge of which folders are backed by disk files. `managed_directories` is desktop-local SQLite. As a result:

- Web's `DELETE /notes/folders/:id` soft-deletes unconditionally (`noteStore.ts:877`), leaving the folder in a trash state with no clear recovery story for on-disk content.
- The sync path hard-deletes (`sync.ts:451`), producing an asymmetric outcome depending on which client initiated the delete.
- Other desktops that sync the same folder (but don't manage it) have no way to warn the user.

## Items

### 1.1 — Schema + wire

- Add `Folder.isLocalFile Boolean @default(false)` to `packages/ns-api/prisma/schema.prisma`
- Create Prisma migration `2026XXXX_add_folder_is_local_file/migration.sql`
- Add `isLocalFile: boolean` to `FolderSyncData` in `packages/ns-shared/src/types.ts`
- Update `toFolderSyncData` in `sync.ts:33` to include the flag
- Update `applyFolderChange` create + update paths in `sync.ts:430-524` to persist the flag

### 1.2 — Desktop set-points

Stamp `isLocalFile = true` and enqueue a folder sync in three places:

- `addManagedDirectory` (`db.ts:1851`) — on the root folder when a managed directory is registered. If the root folder is newly created, set the flag at creation. If it's an existing folder being adopted, update it.
- `resolveFolderForPath` (`db.ts:1947`) — every folder it auto-creates to mirror an on-disk subdirectory.
- Keep-local import flow — any folder created as part of the import.

### 1.3 — Backfill

Startup self-heal on desktop:

1. Walk `managed_directories` rows.
2. For each, traverse the folder tree from `root_folder_id` downward.
3. Mark every folder `isLocalFile = true` if not already set.
4. Enqueue sync updates.
5. Gate behind a `sync_meta` flag (`managed_folder_backfill_done = 1`) so it runs once per install.

### 1.4 — REST delete: all folders hard-delete + tombstone

In `packages/ns-api/src/store/noteStore.ts` (`deleteFolderById`):

- Every folder delete (managed or not) now hard-deletes and writes an `EntityTombstone`. Folders have no user-facing trash/restore UI, so soft-delete only ever generated zombie rows.
- `recursive` mode: hard-delete every folder + every note in the subtree; tombstone each one.
- `move-up` mode: re-file children + notes to the parent; hard-delete the folder; tombstone just the folder.

### 1.5 — Tombstones infrastructure + pull-side cleanup

**Server side** (ns-api):

- `EntityTombstone` model + migration `20260418000001_add_entity_tombstones`. Columns: `(id, userId, entityType, entityId, deletedAt)`. `(userId, entityId)` unique so re-emits upsert.
- `writeTombstone(tx, userId, type, id)` helper in `syncStore.ts`; called from:
  - REST folder delete (`noteStore.deleteFolderById`)
  - Sync-push folder delete (`sync.applyFolderChange`)
  - Sync-push `isLocalFile` note delete (`sync.applyNoteChange`)
- `getTombstonesChangedSince(userId, since)` + `SyncPullResponse.tombstones` deliver them to clients. Cursor-math extended so tombstones participate in the per-type `safeAdvance` calculation.

**Wire** (ns-shared):

```ts
export interface SyncTombstone {
  id: string;
  type: "folder" | "note";
  deletedAt: string;
}
export interface SyncPullResponse {
  changes: SyncChange[];
  tombstones?: SyncTombstone[];   // added
  cursor: SyncCursor;
  hasMore: boolean;
}
```

**Desktop client** (ns-desktop):

- `db.ts`: `hardDeleteFolderFromRemote`, `hardDeleteNoteFromRemote`, `getNoteLocalFileInfo`, `findManagedDirForFolder` (recursive CTE walking ancestors).
- `syncEngine.ts`: `pullChanges` processes tombstones after regular changes. Notes before folders so per-note trash moves see files that still exist even if their ancestor is about to go.
- **Folder tombstone for a managed root**: stop watcher → remove `managed_directories` row → `moveToTrash(path)` → hard-delete local row. Ordering is critical — watcher cleanup must precede trash move to prevent phantom events.
- **Note tombstone with a `local_path`**: stop per-note watcher → `moveToTrash(file)` → hard-delete local row.
- `moveToTrash` failures (file already trashed with its ancestor) are logged as warnings, not fatal.

**Mobile client** (ns-mobile):

- `noteStore.ts`: `hardDeleteNoteFromRemote`, `hardDeleteFolderFromRemote`. No on-disk mirror, so just SQLite + FTS cleanup.
- `syncEngine.ts`: `pullChanges` processes tombstones inline.

### 1.6 — Web UX warning

In the web delete-folder confirmation dialog:

- If `folder.isLocalFile === true`, show: "This folder is managed on a desktop. Deleting will move the on-disk files to trash and remove the folder from the cloud."
- Require explicit confirmation (double-opt-in or typing the folder name, depending on your UX bar).

## Edge cases covered

| Scenario | Behavior |
|---|---|
| Folder managed on Desktop A, synced to Desktop B (not managed there) | B hard-deletes from SQLite, does nothing on disk (no `managed_directories` match). A moves disk content to trash. |
| Mixed folder contents (local-file notes + regular notes) | Notes already route by their own `isLocalFile` flag (`sync.ts:323`). Folder flag only decides the folder itself. |
| Un-managing a directory (removing from `managed_directories` without delete) | **Explicit handler** — clear `isLocalFile` on root + descendants, enqueue sync, stop watcher. |
| Managed folder moved under non-managed parent | Flag stays on the folder itself. `managed_directories.root_folder_id` remains authoritative. |
| Folder hard-deleted on server while desktop watcher is live | On pull-delete, stop watcher and remove `managed_directories` row **before** calling `moveToTrash`. Prevents phantom re-index of files being trashed. |
| User creates a new subfolder on the web under a managed folder | Server has no desktop hook to mark it `isLocalFile`. **Decision needed**: either propagate the flag from parent at create time on the server, or let the desktop stamp it on next sync (simpler; acceptable lag). |
| Folder exists with `isLocalFile = true` but no desktop has it in `managed_directories` (user uninstalled desktop) | Server-side hard-delete still runs; no client moves files to trash. Acceptable — files stay on disk orphaned, user can clean up manually. |

## Done criteria

- Web can delete a managed-locally folder and:
  - Folder is hard-deleted on server
  - All descendant folders and notes are hard-deleted
  - Desktop pulling the delete moves the on-disk directory to OS trash
  - Watcher is cleanly stopped, `managed_directories` row removed
- Non-managed folder deletes still soft-delete (today's behavior preserved)
- Backfill runs once per install, logs how many folders it flagged
- Integration test for each of the edge cases above

## Out of scope

- Folder trash / restore UI (current behavior is preserved for non-managed folders)
- Per-device attribution in the web warning ("managed on Desktop-1") — the flag is global, not per-device
- Handling folders managed by multiple desktops simultaneously (undefined; outside this phase)

## Dependencies

None. Can run in parallel with Phase 0.
