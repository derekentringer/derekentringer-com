# Phase 3 — Local File-Sync Robustness

## Goal

Close races and silent-corruption paths in the desktop file watcher and in the FK-less local SQLite. Three concrete fixes plus explicit lifecycle handling for managed directories.

## Why this matters

The desktop's self-write suppression is timer-based and can be beaten by a well-timed external editor write. The FK-less tables (migrations 013, 014) solved a data-loss bug but the new failure mode — silently accepting orphan references — still exists. Managed-directory lifecycle edges (remote delete while watcher is live; unmanage) are undefined today.

## Items

### 3.1 — Hash-based watcher suppression

**Location**: `packages/ns-desktop/src/lib/localFileService.ts:25-30`, `42-49`, `231-249`

**Problem**: `writeLocalFile` adds to `suppressedPaths`, writes, waits 100ms, removes. Debounced watcher (200ms) checks `suppressedPaths.has(path)` and drops self-events. TOCTOU window:

- T+0: app writes file, adds to suppressedPaths
- T+50: external editor writes to file (well within app's write cycle)
- T+100: app removes from suppressedPaths
- T+250: debounced watcher fires, checks suppressedPaths — empty — reads file, sees the external edit, applies it. OK so far.

But inverse: if external editor writes at T+50 and app's write finishes at T+80, the debounced event at T+250 may reflect *either* write — the file's current state is ambiguous. Worse: if the watcher fires during the suppression window because the external edit triggered it, and the debounce window happens to expire inside the suppression, the external change is silently dropped.

**Fix**: Replace timer-based suppression with hash-based dedup.

- Store `lastWrittenHashByPath: Map<string, string>` (already `lastKnownHashes` exists but is underused)
- In `writeLocalFile`, after successful write, store the content hash
- In watcher callback, compute hash of current file content; if equal to `lastWrittenHashByPath[path]`, drop the event (it's our write)
- Keep `suppressedPaths` as a short (50ms) buffer for raw write-flush latency, but make hash the authoritative check

**Edge case**: external writer produces identical content (hash match). Treated as no-op — correct behavior.

### 3.2 — App-level referential deferral

**Location**: `packages/ns-desktop/src/lib/syncEngine.ts:623-696`, `packages/ns-desktop/src/lib/db.ts` (upsert functions)

**Problem**: After migrations 013/014 dropped the FKs, orphan references are accepted silently. A note arriving before its folder, or an image arriving before its note, is inserted with a dangling pointer. If the parent never arrives (or arrives deleted), the orphan is permanently broken.

**Fix**: Add a `pending_refs` SQLite table and deferral logic.

New table (migration 016):

```sql
CREATE TABLE IF NOT EXISTS pending_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,     -- "note" | "image"
  entity_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,        -- "folder" | "note"
  ref_id TEXT NOT NULL,
  payload TEXT NOT NULL,         -- full SyncChange JSON
  enqueued_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pending_refs_ref ON pending_refs(ref_type, ref_id);
```

Flow in `applyNoteChange`:

1. If `noteData.folderId` is non-null, check local folders for existence (not deleted).
2. If missing, insert row into `pending_refs`, skip the upsert, log at debug level.
3. After each successful `applyFolderChange`, query `pending_refs` for `ref_type = "folder" AND ref_id = <folder.id>`, replay those changes, delete the rows.

Same shape for `applyImageChange` with `ref_type = "note"`.

**Retry semantics**: pending refs older than 24h are logged as warnings (possible permanent orphan — parent was probably deleted before the child arrived); can be dropped after 7 days via a maintenance sweep.

### 3.3 — Reconcile-on-remote-delete for managed dirs

**Location**: `packages/ns-desktop/src/lib/syncEngine.ts:668-683`

**Problem**: If a folder is hard-deleted remotely (e.g. via Phase 1's new web flow), the desktop's watcher on that directory is still running. When `moveToTrash` is called, the in-flight move generates FS events. The watcher callback could try to re-auto-index files that are actively being moved out, or could fire the folder-remote-deleted callback after the UI has already moved on.

**Fix**: Explicit ordering in `applyFolderChange` delete branch:

1. Look up `managed_directories` row matching the folder ID (self or ancestor)
2. If found: `stopDirectoryWatching(path)` first
3. Remove `managed_directories` row
4. `moveToTrash(path)`
5. Fire `folderRemoteDeletedCallback`
6. `softDeleteFolderFromRemote(change.id)` → hard-delete from SQLite (per migration 013)

### 3.4 — Managed-directory unmanage handler

**Location**: wherever the desktop UI lets users remove a managed directory

**Problem**: Today, removing from `managed_directories` doesn't clear `isLocalFile` on the folders or stop the watcher cleanly.

**Fix**:

1. Stop recursive watcher on the path.
2. Clear `isLocalFile` on the root folder + all descendants in local SQLite.
3. Enqueue folder sync updates so the server and other devices see the change.
4. Remove the `managed_directories` row.
5. Files on disk stay put — user was explicit about not wanting on-disk management any more.

### 3.5 — Watcher gap detection

**Location**: `packages/ns-desktop/src/lib/localFileService.ts:304-330`

**Problem**: Platform file watchers (macOS FSEvents, Linux inotify, Windows ReadDirectoryChangesW) can silently drop events under load or during suspend/resume. No current instrumentation surfaces this.

**Fix**: In `startPollTimer`, when the 30s poll detects a hash change that the watcher callback never reported:

- Log at warn level with path + old/new hash
- Increment a counter stored in `sync_meta` (e.g., `watcher_gap_count`)
- Optionally surface in Settings for diagnostic purposes

Low-cost visibility into whether our watchers are reliable across platforms.

## Edge cases covered

| Scenario | Behavior |
|---|---|
| External editor writes during app's 100ms suppression window | Hash check identifies the event as non-self; change applied correctly. |
| External edit produces identical content to app's last write | Hash match — event dropped. Correct (no-op). |
| Image arrives in sync batch before its note | Inserted into `pending_refs`; replayed when note arrives. |
| Image's note is hard-deleted before the image arrives | Pending-ref sweep at 7d removes the orphan; log surfaces it. |
| Folder deleted remotely while desktop watches its disk path | Watcher stopped, dir trashed, local rows removed — in that order. No phantom re-index. |
| User unmanages a directory | Flag cleared, sync enqueued, watcher stopped. Files stay on disk. |
| Watcher silently drops events on a burst | Poll timer detects + logs; user sees diagnostic counter. |

## Done criteria

- Phase 0 hash-dedup test passes (external write during suppression window is NOT dropped)
- Phase 0 referential-deferral test passes (image before note → eventually resolves)
- Managed-dir lifecycle covered by test: register → add file → delete folder on server → on-disk trash, no crash, no phantom events
- `pending_refs` table exists with retry + expiry logic
- Unmanage flow covered by a UI test

## Out of scope

- Cross-platform watcher equivalence (macOS vs. Windows WASAPI-equivalent already diverges elsewhere; this phase doesn't try to normalize them)
- Conflict resolution UI for file-vs-cloud divergence (separate feature, already partially handled by `localFileCloudUpdate` callback)
- Migrating to a different filesystem watcher library (out of scope)

## Dependencies

Phase 0 test harness (`fsFixture.ts`) must exist to verify watcher fixes.
