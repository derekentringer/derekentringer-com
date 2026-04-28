# Sync Management — Phased Plan

This long-lived branch (`develop-sync-mgmt`) tracks NoteSync sync UX work:
making sync **observable**, **controllable**, and **viable for large
datasets**. Today the sync engine works correctly (see
[`docs/ns/sync-arch/`](../sync-arch/)) but offers the user almost no
visibility or knobs — the status button cycles through `idle / syncing
/ offline / error` and that's it.

## Why this matters

A user with a fresh device and 14,000 notes runs the app for the first
time. The engine pulls in batches and the SQLite store grows over a
few minutes. The user sees `Syncing…` and has no idea whether to wait,
quit and retry later, or worry that something's broken. A user on a
metered connection has no way to defer pulling a 200 MB image until
they're back on Wi-Fi. A user whose sync is silently failing on a
specific entity has no actionable surface beyond the existing
`onSyncRejections` dialog.

We can fix all of these without breaking the engine's current
correctness contract — most of the work is exposing data the engine
already has plus adding two new control primitives (pause / cancel).

## Phases

Ordered by user value × implementation cost. Each phase is independently
shippable; later phases compose on the telemetry the earlier ones add.

| # | Phase | Brief | User value | Cost |
|---|-------|-------|------------|------|
| A | [Progress visibility](./phase-a-progress.md) | Per-entity counts, byte totals, last-pull-at, queue depth in a status popover | High — replaces "Syncing…" with "Pulled 523/14,000 notes" | Low. No protocol change; engine already has the numbers. |
| B | [Pause / Resume](./phase-b-pause-resume.md) | Idle the engine on demand; queue local pushes; resume cleanly | High for metered / battery-conscious / focus-mode use | Medium. New engine state + UI affordance. |
| C | [Cancel / Abort](./phase-c-cancel.md) | Abort the active pull/push mid-batch; cursor stays put for retry next tick | Medium — niche but reassuring when a batch is stuck | Low–medium. AbortController plumbing + UI affordance. |
| D | [Sync Health panel](./phase-d-health-panel.md) | Power-user diagnostic surface: cursor positions, recent rejections, batch log | Medium — high for users debugging an issue | Low (composes on A's telemetry). |
| E | [Selective / windowed sync](./phase-e-selective-sync.md) | Sync window (modified-in-last-N-months) + per-folder offline opt-in; lazy-load older content on demand | Very high for large datasets / disk-constrained devices | High. Engine + storage + UI changes. |

## Recommended starting cadence

Phase A is the foundation; everything else builds on its telemetry. We
also get a lot of free perceived improvement from A alone — most of
the user pain is "I don't know what's happening." After A lands, B
(Pause/Resume) is the next-highest-leverage piece because it gates the
metered-connection use case.

Phase E is intentionally last in the queue. It's the most ambitious
work (touches local storage shape, sync filter shape, server pull-side
filtering) and benefits from having the progress + control surface
already in place to debug against.

## Non-goals

- Re-architecting the sync engine itself — see `docs/ns/sync-arch/` for
  the existing correctness model and invariants. This branch should
  build on top of those guarantees, not relax them.
- Conflict-resolution UX changes — that's covered by the existing
  `SyncIssuesDialog` and is out of scope unless a phase explicitly
  pulls it in.
- Server-side scaling work — phase E may need pull-side query
  pagination tuning, but multi-tenant scaling, sharding, etc. are
  separate concerns.

## Branch model

Mirrors `develop-ai-assist`: long-lived `develop-sync-mgmt` off
`develop`. Per-phase feature branches off `develop-sync-mgmt`, merged
back via PR, then `develop-sync-mgmt` rolls up to `develop` when each
phase is ready or when the branch is end-of-lifed.

## Cross-references

- Engine reference: [`docs/ns/sync-arch/00-architecture-reference.md`](../sync-arch/00-architecture-reference.md)
- Invariants the engine guarantees today: [`docs/ns/sync-arch/invariants.md`](../sync-arch/invariants.md)
- Frontend integration points: `packages/ns-desktop/src/lib/syncEngine.ts`, `packages/ns-desktop/src/components/SyncStatusButton.tsx`, `packages/ns-desktop/src/components/SyncIssuesDialog.tsx`
