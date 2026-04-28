# Phase D — Sync Health Panel

**Goal**: a power-user diagnostic surface for understanding what the
engine is doing and what's gone wrong.

Composes on Phase A's telemetry. No new engine work in the happy path
— just exposing data we already collect, plus a small log buffer.

## What the user sees

A new view at `Settings → Sync → Health` (or a dedicated route — TBD
in the implementation PR). Sections:

### 1. Cursor positions

Per-entity, what timestamp the engine is up to vs the latest server
update.

```
Notes        Local: 2026-04-27T14:32:15Z   Server: 2026-04-27T14:32:15Z   ✓
Folders      Local: 2026-04-27T14:32:15Z   Server: 2026-04-27T14:32:15Z   ✓
Images       Local: 2026-04-26T08:14:02Z   Server: 2026-04-27T14:31:50Z   ⚠ behind
Embeddings   Local: 2026-04-27T14:30:00Z   Server: 2026-04-27T14:32:15Z   ⚠ slightly behind
```

### 2. Recent activity (rolling log buffer)

Last ~50 batches with timestamps, durations, counts, and outcome.

```
14:32:15  Pulled 12 notes, 0 folders, 3 images        287ms ✓
14:31:48  Pulled 5 notes, 0 folders, 0 images         142ms ✓
14:31:30  Pushed 1 note, 0 folders                    178ms ✓
14:30:11  Pulled 0 notes, 0 folders, 0 images          92ms ✓ (no changes)
14:28:53  Push rejected: note-abc (timestamp_conflict) ✗
...
```

### 3. Outbox

Pending pushes that haven't yet flushed. Each row clickable for
details (which entity, which fields changed, last error if any).

### 4. Rejections (recent)

Same data the existing `SyncIssuesDialog` shows but in a persistent
view rather than a modal. Useful for "what was that thing that
failed last week?" use cases.

### 5. Force actions

Defensive escape hatches:

- **Force full pull**: reset local cursor to epoch and re-pull
  everything. Useful after a suspected local DB corruption.
- **Resync entity**: same but scoped to one entity type.
- **Clear outbox**: nuke pending pushes (with confirmation). Last
  resort when an outbox entry is wedged on a server-side rejection
  the user can't resolve.

## Implementation outline

### 1. Telemetry buffer

Engine maintains a circular buffer of the last N (50?) batch events
in memory + persisted to localStorage. New event type alongside
`SyncProgress`:

```ts
type SyncBatchEvent = {
  at: string;
  kind: "pull" | "push";
  durationMs: number;
  counts: Partial<Record<Entity, number>>;
  outcome: "ok" | "error" | "rejected";
  errorMessage?: string;
};
```

### 2. Cursor position read

A new endpoint (or existing pull stats response augmented) returns
the server's latest update timestamp per entity. The local cursor is
already in `sync_meta` table on the client.

### 3. Force-action endpoints

Most of these reuse existing engine functions:
- Force full pull → reset `sync_meta.cursor.<entity>` then run pull
- Resync entity → same, scoped
- Clear outbox → delete from `sync_queue` table

Each guarded by a confirm dialog (these are destructive in a recoverable
way — same shape as Empty Trash).

## Done criteria

- Sync Health page renders the four sections with live data
- Recent batches buffer survives reload
- Force actions all work, all gated behind confirmation
- Cursor positions reflect both client + server sides correctly

## Out of scope

- Real-time charts / graphs — text + counts is plenty for diagnostics
- Per-tenant admin view — single-user app
- Server-side sync log viewer — that's a Railway logs concern, not UI

## Risks / open questions

- **Cursor "behind" warning thresholds.** What counts as "ok" vs
  "behind"? Probably anything >5 minutes behind on a connected client
  is suspicious. Soft threshold; user can ignore.
- **Force full pull on a 14k-note dataset.** This is a slow operation.
  Should warn user before running ("This will take ~5 minutes").
- **Privacy of the activity log.** Recent batches log entity counts but
  not entity contents. Make sure rejection error messages don't echo
  user-private content (titles etc.) into the persistent log unless
  scrubbed.
