# Sync Architecture Hardening Plan

## Goal

Harden both NoteSync sync systems — desktop local-file sync and cross-platform cloud sync — against edge cases that can lose or corrupt data. Specifically:

1. Kill soft-delete ambiguity for managed-locally folders and files
2. Fix silent data-loss bugs in the push/pull protocol
3. Close races in the desktop file watcher
4. Make orphan references from FK-less tables impossible

The system is mostly working today; this plan is about closing edge cases, not rewriting anything.

Hardening scope covers Phases 0–4. Performance work and architectural unification are tracked as follow-up phases (5–6) so they stay on the radar without muddling the hardening effort.

## Current state

See [`00-architecture-reference.md`](00-architecture-reference.md) for a snapshot of both sync systems as they exist today — key files, tables, wire protocol, and load-bearing asymmetries.

Post-hardening contract (Phases 1–3 outcomes): [`invariants.md`](invariants.md).

## Phases

| Phase | Status | Goal | Depends on |
|---|---|---|---|
| [0](01-phase-0-test-harness.md) | ✅ done | Real-Postgres + multi-client test infra | — |
| [1](02-phase-1-managed-locally-deletes.md) | ✅ done | Hard-delete + tombstones for folders & managed notes; web-aware flag | — |
| [2](03-phase-2-sync-correctness.md) | ✅ done | Fix tx abort cascade, cursor ties, clock skew | 0 |
| [3](04-phase-3-local-file-robustness.md) | ✅ done | Hash-based watcher suppression, referential deferral, managed-dir lifecycle | 0 |
| [4](05-phase-4-housekeeping.md) | ✅ done | Indexes, comment drift, invariants doc | — |
| [5](06-phase-5-performance.md) | pending | Post-hardening perf (embedding dedup, upload concurrency, SSE jitter) | 1–4 complete |
| [6](07-phase-6-web-sync-unification.md) | pending | Web adopts `/sync/push|pull` | 1–5 complete + product trigger |
| [A](08-phase-a-cascade.md) | pending | Strict `isLocalFile` cascade + cross-boundary move consent (conceptual "Notebook" model without the rename) | 1–4 complete |
| [B](09-phase-b-notebook.md) | pending | Rename root folders to Notebooks; top-level-only managed/unmanaged; UX refresh | A complete |

## Release sequence

```
Phase 0 ──┬── Phase 1 (managed-locally)   ──┐
          ├── Phase 2 (sync correctness)  ──┼── Phase 4 (housekeeping) ── Phase 5 (perf) ── Phase 6 (web unification)
          └── Phase 3 (local robustness)  ──┘
```

- Phases 1–3 can run in parallel after Phase 0 lands.
- Phase 4 item "composite indexes" can land anytime independently.
- Phase 6 is product-gated; only pursue when web gains real offline-editing use cases.

## Estimated effort

- Hardening (0–4): ~3–5 dev days
- Performance (5): ~1 dev day
- Web unification (6): ~40–60 hours

## How to use these docs

Each phase doc is self-contained:

- **Goal** — what this phase fixes
- **Items** — specific changes with file:line references
- **Edge cases** — scenarios the phase must handle correctly
- **Done criteria** — how we know it's shipped
- **Out of scope** — adjacent work that belongs in another phase

Open issues or feature-planning docs per phase as you pick them up; link back here.
