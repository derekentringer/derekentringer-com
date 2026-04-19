# Phase 6 — Web Sync Protocol Unification (Long-Term)

## Goal

Bring `ns-web` onto the same `/sync/push|pull` protocol used by desktop and mobile. Eliminate the REST + IndexedDB offline-queue asymmetry so all three clients share one conflict-handling model, one rejection surface, and one offline-first semantics.

## Why this is last (and product-gated)

The current asymmetry is load-bearing but not broken:

- Web is online-first with an offline fallback. For most web users, the REST + IndexedDB cache is sufficient.
- Desktop and mobile are offline-first because users genuinely edit without connectivity.

Investing 40–60 hours to unify the protocols is only worthwhile when web gains a real offline-editing story — e.g., PWA install, extended flight/subway use, cross-device conflict scenarios that web's current queue handles poorly.

**Trigger criteria** (pick at least one before starting):

1. Telemetry shows > 5% of web users hit the offline fallback weekly
2. Support tickets about "my web edits didn't sync" or "I lost changes when my connection dropped"
3. Product decision to launch PWA with full offline support
4. Desire to enable multi-device conflict resolution UI on web (currently desktop-only)

Without one of these, Phase 6 stays documented but unscheduled.

## Why this is worth doing eventually

- **One conflict model**: desktop's `onSyncRejections` with `forcePush` / `discard` closures is the right UX. Web currently has no equivalent.
- **True multi-device offline**: web could participate in the same LWW arbitration as desktop/mobile, not just optimistic REST with silent last-writer-wins.
- **Maintenance burden**: two offline-queue implementations (`packages/ns-web/src/lib/offlineQueue.ts` vs. the sync engines) means two sets of bugs.
- **Feature parity**: force-push, discard, sync status button, rejection UI — all desktop features that web re-implements or lacks.

## Scope

### 6.1 — Port sync engine to web

**Location**: new file `packages/ns-web/src/lib/syncEngine.ts`

- Same shape as desktop's engine: `initSyncEngine`, `destroySyncEngine`, `notifyLocalChange`, `manualSync`, `getSyncStatus`
- SSE connection via `fetch` (web has native support, unlike mobile's XHR workaround)
- IndexedDB as the local "SQLite equivalent": reuse existing `packages/ns-web/src/lib/db.ts` as the schema, add sync queue + sync meta tables
- Use Web Locks API to prevent multiple tabs from syncing concurrently

### 6.2 — Replace REST offline queue

**Location**: `packages/ns-web/src/api/offlineNotes.ts`, `packages/ns-web/src/lib/offlineQueue.ts`, `packages/ns-web/src/hooks/useOfflineCache.ts`

- Delete the REST offline queue
- Route all write operations through the sync engine's `notifyLocalChange()` instead
- Reads continue to hit IndexedDB first (sync engine keeps it fresh)

### 6.3 — Sync rejection UI on web

**Location**: new components `packages/ns-web/src/components/SyncIssuesDialog.tsx` (mirror the desktop component)

- Same UX as desktop: per-item + bulk Force Push / Discard
- Wire up `onSyncRejections` callback from the new sync engine

### 6.4 — Cross-tab coordination

Multiple open tabs of `ns-web` would otherwise double-sync. Options:

- Web Locks API: acquire `"notesync-sync-leader"` lock; only the leader tab runs the sync engine. Others read from IndexedDB via `BroadcastChannel` for UI updates.
- Service Worker: run sync in a shared SW context. Adds complexity but removes per-tab duplication entirely.

Recommend Web Locks for v1.

### 6.5 — Migration plan for existing web users

- Deploy sync engine behind a feature flag
- On first run, import existing IndexedDB notes into the new sync queue (if any pending writes)
- Run dual-mode for 1–2 weeks (both paths active, comparing outputs) before removing REST offline queue

## Edge cases

| Scenario | Behavior |
|---|---|
| User has two tabs open, one offline, one online | Leader (online tab) syncs; offline tab reads from IndexedDB via BroadcastChannel |
| User closes all tabs mid-sync | Next tab open triggers full resync; server-side LWW + cursor protects against double-apply |
| IndexedDB blocked / quota exceeded | Fall back to REST-only; log warning. Existing behavior as failsafe. |
| User on different browser (Chrome at home, Firefox at work) | Each browser has its own deviceId + cursor; same model as desktop. |
| User clears browser storage | Full re-pull; `since = epoch`; same as fresh install. |

## Estimated effort

- 6.1 Port sync engine: 16h
- 6.2 Replace REST queue: 8h
- 6.3 Rejection UI: 6h
- 6.4 Cross-tab coordination: 8h
- 6.5 Migration + feature flag + dual-mode: 12h

**Total**: ~50h engineering + ~10h QA.

## Done criteria

- Web sync engine running in prod behind a feature flag for ≥ 2 weeks with no data-loss regressions
- Feature flag removed; REST offline queue deleted
- Desktop and mobile sync tests pass unchanged against the same server
- Web rejection UI functional; at least one test scenario verified end-to-end
- Cross-tab coordination verified with 2+ tab test

## Out of scope

- Mobile web / PWA packaging (separate product work)
- Service Worker sync (decision: Web Locks is v1; SW is v2 if needed)
- Schema changes on server — Phase 6 is strictly a client-side refactor

## Dependencies

- Phases 0–5 stable in production
- Product trigger (see above) met
- Engineering bandwidth for a ~50h focused effort
