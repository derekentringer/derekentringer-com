# Phase A — Strict `isLocalFile` cascade + cross-boundary move consent

## Goal

Make managed-vs-unmanaged a property of the root-level folder only (conceptually a "Notebook"), with every descendant's `isLocalFile` flag guaranteed to equal its root ancestor's. Cross-boundary moves — dragging a folder across the managed/unmanaged line — require explicit user consent and trigger the appropriate on-disk work. No `isLocalFile` drift is possible at any write point on any client after this phase lands.

This phase is the "enforcement + consent UX" slice. The user-facing terminology rename (Folder → Notebook at the root level) is deferred to Phase B.

## Why this matters

Today `isLocalFile` is a per-folder flag that can drift. Every bug chased in the Move-to-Root thread reduced to "a descendant's flag disagreed with its ancestor's." Symptoms observed:

- Regular folder created on web under a managed root gets `isLocalFile=false`, breaks the delete-dialog UX.
- Descendants of a managed root whose flag isn't backfilled miss the managed icon.
- Reconciliation aggressively deletes NoteSync folders with no disk mirror, silently trashing regular folders that happened to sit under a managed root.
- Moving a folder out of a managed subtree has no atomic on-disk consequence — the file stays on disk while the note row says it's somewhere else.

The fix is an **invariant**, not another guard: a folder's flag equals its root ancestor's flag, always. Everything downstream (icons, dialogs, disk ops, context menus) becomes trivially correct.

## The invariant

For every `folder`:

```
folder.isLocalFile === rootAncestor(folder).isLocalFile
```

Where `rootAncestor(folder)` is the transitive ancestor with `parentId = null`. The invariant holds after every write on every client.

## Items

### A.0 — Backfill migration (server + clients)

One-time sweep that forces every existing folder's flag to match its root's. Logs the count flipped so we know how much drift existed.

**Server** (`packages/ns-api`):
- New migration `20260419000000_normalize_folder_is_local_file/migration.sql` using a recursive CTE:
  ```sql
  WITH RECURSIVE roots AS (
    SELECT id, "isLocalFile" AS root_flag, id AS root_id FROM folders WHERE "parentId" IS NULL
    UNION ALL
    SELECT f.id, r.root_flag, r.root_id FROM folders f JOIN roots r ON f."parentId" = r.id
  )
  UPDATE folders SET "isLocalFile" = r.root_flag
  FROM roots r
  WHERE folders.id = r.id AND folders."isLocalFile" != r.root_flag;
  ```
- Run via `prisma migrate`. Log the count of rows changed in release notes; > 50 rows flipped is worth a Slack alert.

**Desktop** (`packages/ns-desktop`):
- Extend `backfillManagedFolders` in `src/lib/db.ts` with a second sweep gated behind `sync_meta.isLocalFileCascadeDone=1`.
- SQLite recursive CTE mirrors the server.

**Mobile** (`packages/ns-mobile`):
- Same sweep on first boot after this phase ships; gated behind an equivalent `sync_meta` flag.

### A.1 — Server-side invariant enforcement

**Location**: `packages/ns-api/src/store/noteStore.ts` + `packages/ns-api/src/routes/sync.ts`.

Add a centralized helper:

```ts
async function normalizeFolderIsLocalFile(
  tx: PrismaTx,
  userId: string,
  parentId: string | null,
  proposedFlag: boolean,
): Promise<boolean> {
  if (parentId === null) return proposedFlag;           // becoming its own root
  const root = await findRootAncestor(tx, userId, parentId);
  return root.isLocalFile;                              // descendants inherit
}
```

Call it from every folder-write site:
- `createFolder` — compute from parent chain (already partly there from commit `b8c5ca5`; rewrite to walk to the true root for defense-in-depth).
- `moveFolder` — see A.2.
- `applyFolderChange` (sync-push) create + update branches — coerce the incoming `folderData.isLocalFile` to the normalized value. If the incoming value differed, emit a warn log (`client_drift` or similar) so we can track how often clients try to push bad state.

**Verification**: integration test pushes a folder-change with `isLocalFile=false` under a managed root; asserts the server persists `true`.

### A.2 — `moveFolder` cross-boundary detection

**Location**: `packages/ns-api/src/store/noteStore.ts moveFolder` and `packages/ns-api/src/routes/notes.ts` PATCH `/folders/:id/move`.

- Compute `currentRoot = rootAncestor(folderId)` and `targetRoot = rootAncestor(newParentId)`.
- If `currentRoot.isLocalFile === targetRoot.isLocalFile` → proceed as today. Same-boundary move, no flag change needed.
- If they differ → reject with HTTP 409 and a structured body:
  ```json
  {
    "code": "cross_boundary_move",
    "direction": "toManaged" | "toUnmanaged",
    "affectedFolderCount": 7,
    "affectedNoteCount": 42
  }
  ```
  (Counts come from a quick descendant query so the dialog can show "This move affects 7 folders and 42 notes.")
- Client catches, shows the dialog, re-submits with query param `?confirmCrossBoundary=1`.
- With the confirm flag: flip the folder + every descendant's `isLocalFile` in a single `$transaction`. No tombstones are written — the folder isn't deleted, just re-flagged. Server returns 200.

Edge case: moving **to root** (`parentId = null`) — the folder becomes its own root ancestor, flag preserved. Not a cross-boundary move.

### A.3 — Web dialog for cross-boundary moves

**Location**: `packages/ns-web/src/pages/NotesPage.tsx handleMoveFolder` and the DnD drop handler in `FolderTree.tsx`.

`moveFolderApi` (in `src/api/notes.ts`) extended to accept an optional `{ confirmCrossBoundary?: boolean }` third argument that becomes a query param.

`handleMoveFolder` catches 409 with `code: "cross_boundary_move"`, reads `direction` + counts, shows the appropriate dialog:

- `direction === "toManaged"`:
  > Move "X" into "Y"? This will add the folder and its 42 notes to the managed desktop notebook. Files will be written to disk by the managing desktop on its next sync.

- `direction === "toUnmanaged"`:
  > Move "X" into "Y"? This will remove the folder from the managed desktop notebook. Files inside (42 notes) will be moved to the OS trash on the managing desktop on its next sync.

Confirm → `moveFolderApi(id, newParentId, { confirmCrossBoundary: true })`. Cancel → snap the folder back visually.

### A.4 — Desktop: pull-side disk reconciler

**Location**: new helper + hook in `packages/ns-desktop/src/lib/syncEngine.ts applyFolderChange`.

When `applyFolderChange` upserts a folder whose `isLocalFile` is changing from what's locally stored:

- **`false → true` (unmanaged → managed)**: for every note in the subtree with no `local_path`:
  1. Compute target disk path: `managedRoot.path + relative-subtree-chain + note.filename`.
  2. Write the file content via `writeLocalFile`.
  3. Set `local_path` + `local_file_hash` on the note row.
  4. Enqueue a note-sync update so other clients see the hash.
- **`true → false` (managed → unmanaged)**: for every note with a `local_path`:
  1. Stop any per-note watcher.
  2. `moveToTrash(localPath)`.
  3. Null out `local_path` + `local_file_hash`.
  4. Enqueue a note-sync update.

Error handling: any individual file failure is logged + surfaced as a toast diagnostic; the flag flip stays recorded (never rolled back), and a retry mechanism (button in Settings or automatic on next sync) can re-attempt.

Concurrency: while a subtree reconciliation is running, pause the directory watcher for the affected managed root so the in-flight disk writes don't synthesize their own events.

### A.5 — Desktop-initiated cross-boundary moves

**Location**: `packages/ns-desktop/src/pages/NotesPage.tsx handleDragEnd` (folder DnD path), plus a new same-dialog component.

When the user drags a folder across a managed/unmanaged boundary on desktop:

1. Detect cross-boundary before the API call (desktop has the tree locally).
2. Show the same dialog UX as web.
3. On confirm, route through the same API call with `?confirmCrossBoundary=1`.
4. Server flips flags. Desktop pulls on the SSE notify and the A.4 disk reconciler handles the on-disk work.

No new API — same endpoint, same confirm flag. Dialog component shared between desktop and web if the codebases allow; otherwise parallel components with shared copy.

### A.6 — Drop in-memory `managedFolderIds`

**Location**: `packages/ns-desktop/src/pages/NotesPage.tsx` and `packages/ns-web/src/pages/NotesPage.tsx`.

With the invariant enforced, the `managedFolderIds` Set becomes pure derived data from `folder.isLocalFile`. Both UIs already compute it lazily and both already have drift bugs because of it. Delete the Set entirely:

- Folder icon: `folder.isLocalFile === true` (already in place from commit `4d7a223`).
- Context menu "Save locally" shown when `folder.isLocalFile !== true`.
- Context menu "Stop managing locally" shown when `folder.isLocalFile === true` AND the folder has a `managed_directories` row (desktop only — this option is per-root).

Fewer moving parts, one stale-state trap class eliminated.

### A.7 — Mobile

**Location**: `packages/ns-mobile/src/lib/noteStore.ts` + `syncEngine.ts`.

- `upsertFolderFromRemote` coerces incoming `isLocalFile` to match the local tree's root-ancestor flag (same normalize helper, mobile port).
- `moveFolder` (if/when mobile gains one) honors the 409 cross-boundary response with an ActionSheet-style confirm.

No disk-side work on mobile. The cross-boundary dialog is pure UI gating — the reject + retry flow identical to web.

## Edge cases covered

| Scenario | Behavior |
|---|---|
| Move folder up one level within same notebook | Works today, still works. No flag change. |
| Move folder to root | Folder becomes its own root; flag preserved; no cross-boundary. |
| Move managed subtree into unmanaged notebook on web | Server 409s. Dialog. User confirms. Server flips every descendant's flag in one tx. Desktop pulls, A.4 trashes disk files. |
| Move unmanaged folder into managed notebook on desktop | Desktop's drag handler intercepts pre-API, shows dialog, confirms. Server flips flags. Desktop A.4 writes files to disk. |
| Backfill finds 1000 mismatched rows | Logs warn, continues. One-time cost. |
| Desktop offline during a cross-boundary move from web | Server flips flags synchronously. Desktop catches up on next pull via A.4. No data loss (notes + folders still authoritative on server). |
| User edits a note during a large cross-boundary copy | Edit queues normally. Disk copy completes eventually. Last-write-wins at the note level, independent of folder flag. |
| Cross-boundary move affects a folder with pending sync-queue entries | Queue flushes per existing semantics; flag flip is just another folder-update change. Order preserved by queue order. |
| Individual file fails to copy/trash during A.4 reconciliation | Log + diagnostic toast. Flag flip stays recorded. User can retry from Settings or the next sync tries again. |

## Done criteria

- Server rejects folder writes that would violate the invariant; integration test present.
- `moveFolder` 409s on cross-boundary without `confirmCrossBoundary`; succeeds with it; integration test covers both directions.
- Web + desktop show the appropriate dialog and route through the confirm flag.
- Desktop pull-side disk reconciler handles both directions end-to-end; unit test with fsFixture covers the happy path + one failure case.
- Backfill sweep normalizes any drifted rows; integration test seeds drift, runs sweep, asserts convergence.
- `managedFolderIds` Sets removed from both `NotesPage.tsx` files.
- Full end-to-end test (integration harness): unmanaged subtree with 3 notes → move into managed notebook → server flags flip → desktop sync + disk write → reverse move → disk trash + flag flip back.
- `invariants.md` updated to document the post-Phase-A contract.

## Out of scope

- Terminology rename (Folder → Notebook at root). Phase B.
- Multi-select cross-boundary moves — start with single folder, revisit if users ask.
- Real-time disk-copy progress UI beyond a toast.
- Atomic rollback of partial disk-copy failures — log + retry is the contract; rollback adds significant complexity for a rare failure mode.
- Web-initiated moves that try to "wait for the desktop" — if desktop is offline, the move still succeeds server-side and disk catches up whenever desktop comes online.

## Dependencies

- Phase 1 (isLocalFile wire) must have landed. ✅ Done.
- No new schema columns. Reuses `folders.isLocalFile`, `notes.local_path`, `notes.local_file_hash`.

## Estimated effort

| Item | Effort |
|---|---|
| A.0 migration | ~2h |
| A.1 server enforcement | ~3h |
| A.2 `moveFolder` 409 | ~3h |
| A.3 web dialog | ~2h |
| A.4 desktop pull reconciler | ~6h (heaviest item) |
| A.5 desktop drag dialog | ~2h |
| A.6 drop `managedFolderIds` | ~1h |
| A.7 mobile | ~2h |
| Integration + unit tests | ~4h |
| **Total** | **~2–3 dev days** |

## Commit sequence

1. A.0 — backfill migration (server + desktop + mobile).
2. A.1 — server invariant enforcement.
3. A.2 — `moveFolder` 409 + confirmCrossBoundary.
4. A.4 — desktop pull-side disk reconciler.
5. A.3 — web dialog wired to the 409.
6. A.5 — desktop drag dialog wired to the same endpoint.
7. A.6 — drop `managedFolderIds` Set from both UIs.
8. A.7 — mobile.
9. Docs — update `invariants.md`; mark Phase A complete in `README.md`.

A.4 is the single largest item; A.2 + A.3 + A.5 can proceed in parallel with it but the UI depends on the 409 shape being nailed down first, so A.2 before A.3/A.5 in the commit order.
