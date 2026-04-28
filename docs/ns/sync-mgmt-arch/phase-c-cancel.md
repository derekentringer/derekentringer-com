# Phase C — Cancel / Abort

**Goal**: let the user abort an in-flight pull or push batch without
corrupting state.

The engine already commits cursor advancement only on successful batch
completion, so a cancelled batch retries on the next tick from the
same cursor. The work here is plumbing AbortController through the
pull/push fetches and exposing a UI affordance.

## Use cases

1. **Stuck batch.** Server is sluggish or returning a partial response;
   user wants to abandon and retry.
2. **Wrong pull at a bad time.** User started syncing on a metered
   connection by accident; wants to cancel (then Pause from Phase B).
3. **Force a stop without unpausing.** Combined with Phase B, gives
   the user a clean way to reset the engine state.

## Implementation outline

### 1. AbortController plumbing

The pull and push paths use `fetch`. Wrap each batch fetch in an
AbortController stored on the engine:

```ts
let activeBatchAbort: AbortController | null = null;

async function pullBatch() {
  activeBatchAbort = new AbortController();
  try {
    const res = await fetch("/sync/pull", { ..., signal: activeBatchAbort.signal });
    ...
  } finally {
    activeBatchAbort = null;
  }
}

export function cancelActiveBatch(): void {
  activeBatchAbort?.abort();
}
```

Cursors only advance after `applyBatch()` completes successfully, so
an aborted fetch leaves the local state untouched.

### 2. UI affordance

Adds a `[Cancel]` button to the Phase A progress popover, only when
`phase !== "idle"`. Click → call `cancelActiveBatch()` → status flips
to `idle` (or `paused` if Phase B is on); next tick retries.

### 3. Apply-phase abort

The trickier case: a partial-apply abort. If we've already received
the batch and are mid-`applyNoteChange` loop, cancelling could leave
the local DB in a half-applied state. Two safe options:

- **Option A** (simpler): Cancel only aborts the network fetch. Once
  the batch is in-memory, we run apply to completion. Worst-case the
  user waits a few seconds for the in-flight rows to apply.
- **Option B** (more correct): Wrap each batch's apply loop in a
  per-batch transaction; abort throws and rolls back. Larger change,
  may not be worth it for the use case.

Recommend Option A.

## Done criteria

- User clicks Cancel during a pull → fetch aborts, cursor doesn't
  advance, status returns to idle
- Next pull tick retries from the same cursor and gets the same data
- Local DB is in a consistent state (no half-applied notes)
- Cancel during a push aborts the in-flight upload but the queued
  change stays in the local outbox, retried on next tick

## Out of scope

- Selective cancel (cancel notes pull but keep images pull) —
  unnecessary
- Cancel + automatically pause — let the user choose; one click each

## Risks / open questions

- **Retry storm after cancel.** If the user cancels and the engine
  immediately retries on the next tick, we get the exact same batch
  back and the user can't make forward progress. Mitigation: a short
  cooldown (e.g. 5s) after cancel before the next tick fires, OR
  transition to paused state on cancel (let user explicitly resume).
- **Server log noise.** Aborted fetches show as 499/disconnect on the
  server. Tag the request with a `cancelled-by-client` header so logs
  can filter them out.
