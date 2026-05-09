# Phase B — Pause / Resume

**Goal**: let the user temporarily idle the sync engine without losing
queued local changes; resume cleanly.

Depends on Phase A's progress telemetry for the UI affordance and
state surface.

## Use cases

1. **Metered connection.** User is tethering off their phone; pulling
   image binaries would burn data. Pause until back on Wi-Fi.
2. **Battery / focus mode.** User wants to read offline without engine
   chatter / SSE reconnections eating battery during a long flight.
3. **Debugging.** Engineer wants to inspect the local DB without sync
   mutating it under them.
4. **Conflict triage.** A rejection storm is incoming; pause until the
   user has time to resolve them via the existing rejections dialog.

## Behavior contract

When **paused**:

- SSE listener disconnects (no incoming push notifications)
- Push queue accepts new entries but does NOT flush
- Pull loop short-circuits at the top of each tick
- Status button shows `Paused` (distinct from `idle` and `offline`)
- Local edits still write to SQLite; user can keep working

When **resumed**:

- SSE reconnects
- Push queue flushes any accumulated changes
- Pull loop runs immediately to catch up

When the app reloads while **paused**:

- The paused state persists (localStorage). User has to explicitly
  resume — surprise auto-resume after a restart violates expectation.

## Implementation outline

### 1. Engine state

Extend `syncEngine` with:

```ts
let paused: boolean = loadPausedFromStorage();

export function pauseSync(): void { ... }
export function resumeSync(): Promise<void> { ... }
export function isPaused(): boolean { ... }
```

The pull tick checks `paused` first thing. The push flush guards on
`paused` similarly. SSE subscription is wrapped in
`if (!paused) connectSSE()`.

`pauseSync` also disconnects any in-flight SSE connection so we don't
leave a long-poll dangling.

### 2. UI affordance

In the Phase A progress popover, the `[Pause]` button toggles to
`[Resume]` when paused. The status button itself shows a distinct
state — gray clock icon vs blue spinner vs green checkmark.

### 3. Persistence

`localStorage["ns-sync-paused"] = "true"` survives reloads. When the
app boots and reads `paused=true`, the engine never starts a tick
until resumed.

### 4. Push-queue ergonomics

Currently the push queue lives in SQLite (`sync_queue` table). It's
already durable across pause+restart — no new migration needed. The
only delta is the gating check at flush time.

## Done criteria

- User clicks Pause → engine state flips, status button shows Paused,
  no further pulls or pushes happen
- User makes 5 edits while paused → 5 entries accumulate in the local
  outbox, no errors
- User clicks Resume → outbox flushes, pull catches up, status button
  returns to Synced
- Pause survives an app reload
- SSE doesn't reconnect while paused

## Out of scope

- Bandwidth throttling (a separate "low-data mode" idea — different shape)
- Scheduled / time-of-day pause (cron-style) — simple UI doesn't need it yet
- Selective pause per-entity (pause images but not notes) — too clever; revisit only if a user asks

## Risks / open questions

- **SSE reconnection on Resume.** If the server has been pushing many
  events while we were paused, the reconnect should pull everything
  since our cursor — the existing pull loop already handles this.
  Just need to make sure the reconnect happens before the catch-up
  pull tick, not after.
- **Confusion with "offline".** Paused and offline look similar to a
  user. We need clearly distinct copy and iconography. Probably:
  - Offline: "No internet — will sync when you reconnect" (auto-resumes)
  - Paused: "Sync paused by you — click Resume to continue" (manual)
- **Forgot-to-resume failure mode.** If a user pauses and forgets,
  edits silently pile up locally. Mitigations: a small toast every N
  edits while paused, or a banner in the sidebar when the outbox
  exceeds 50 entries.
