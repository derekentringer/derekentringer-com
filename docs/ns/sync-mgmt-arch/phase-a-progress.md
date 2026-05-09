# Phase A — Progress Visibility

**Goal**: replace the binary `Syncing…` status with a real progress
view that tells the user *what* is happening, *how far along* it is,
and *when it last succeeded*.

## What the user sees today

The `SyncStatusButton` shows one of: idle, syncing, offline, error +
the rejections dialog. No counts, no rates, no timestamps. With a
14k-note initial sync the button just spins.

## What we want them to see

A small popover anchored off the sync button (existing pattern —
matches the rejections affordance). Layout sketch:

```
┌────────────────────────────────────────┐
│ ● Syncing…             [Pause] [⋯]     │
│                                        │
│ Pulling notes        523 / ~14,000     │
│ ▓▓▓▓░░░░░░░░░░░░░░░░░░    3.7%         │
│                                        │
│ Pulling images        12 / 304         │
│ Embeddings           up to date        │
│ Folders              up to date        │
│                                        │
│ Pending uploads:     2                 │
│ Last successful pull: 4 minutes ago    │
└────────────────────────────────────────┘
```

When idle:

```
┌────────────────────────────────────────┐
│ ✓ Synced               [Pause] [⋯]     │
│                                        │
│ Last sync: just now                    │
│ Pending uploads: 0                     │
│                                        │
│ [View sync health]                     │
└────────────────────────────────────────┘
```

(Pause and the diagnostic link are stubbed in Phase A and wired in
Phases B and D.)

## Implementation outline

### 1. Engine telemetry

`packages/ns-desktop/src/lib/syncEngine.ts` already drives a
batched pull loop. Add a small in-memory progress object updated on
each batch:

```ts
type SyncProgress = {
  phase: "idle" | "pulling" | "pushing" | "applying" | "error";
  entity: "notes" | "folders" | "images" | "embeddings" | null;
  counts: {
    notes:      { received: number; expected: number | null };
    folders:    { received: number; expected: number | null };
    images:     { received: number; expected: number | null };
    embeddings: { received: number; expected: number | null };
  };
  pendingPushes: number;
  lastSuccessfulPullAt: string | null; // ISO timestamp
  bytesTransferred: number;
};
```

`expected` is best-effort: the server returns `hasMore` flags today,
so the client can't render a true denominator without a server-side
count endpoint. Phase A just shows `received / hasMore?` honestly —
"Pulled 523 notes, more pending" — which is already a huge upgrade
over `Syncing…`.

A new optional callback `onProgress?: (progress: SyncProgress) => void`
fires on each batch boundary. Throttled to ~250ms via the existing
debounce helpers so a fast pull doesn't thrash React.

### 2. Status button popover

New component `SyncProgressPopover` opens from `SyncStatusButton` on
click (replaces the current pure-toggle behavior; the existing
rejections dialog still surfaces from inside the popover when
applicable). Contents driven by the `SyncProgress` callback piped
through to `NotesPage` state.

Mobile/web parity: same component on web (`packages/ns-web`); web
fetches don't have the same batch shape but the popover still shows
push queue depth + last-pull-at.

### 3. Server "expected" count (optional, defer if costly)

A new `/sync/pull/stats` endpoint returns counts of changes since the
client's cursor without paginating them. Lets us draw the percentage
bar with a real denominator. Defer to Phase A.5 if the count query is
expensive — Phase A still ships value without it.

### 4. Persistence

`lastSuccessfulPullAt` saves to localStorage so it survives reloads.
`pendingPushes` is derived from the existing local outbox queue.

## Done criteria

- Status button click opens a popover with live counts during a sync
- During an initial sync, user sees notes / images / embeddings count
  up in real time
- After sync completes, popover shows "Last sync: 2 min ago" and zero
  pending
- All numbers reflect reality with <500ms lag
- Hits 60fps during a 5k-note pull (no React thrash)

## Out of scope

- Pause / resume controls (Phase B)
- Cancel an in-flight batch (Phase C)
- Per-batch transfer log / advanced diagnostics (Phase D)
- Selective sync filtering (Phase E)

## Risks / open questions

- **Cost of the `expected` count query.** Postgres `count(*) where
  updatedAt > $cursor and userId = $u` may be slow with millions of
  rows. If so, fall back to the "received N, more pending" framing
  rather than blocking Phase A.
- **Web vs desktop divergence.** Web's sync is far simpler (no SSE
  subscription, no SQLite). We need a small `SyncProgress` shape that
  works for both. Likely the web popover only shows `lastSuccessfulSync`
  + `pendingPushes` without a per-entity breakdown.
- **Throttle granularity.** 250ms feels right for visible progress; if
  it stutters, lower to 100ms but watch the React re-render cost.
