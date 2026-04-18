# Phase 5 — Performance (Post-Hardening)

## Goal

Optimize for speed and resource usage once correctness is stable. None of these are blocking; all deferred until Phases 0–4 have shipped and soaked in production.

## Why this is separate from hardening

Performance work on a shifting correctness foundation is wasted effort — optimizations get invalidated as semantics change. Each item here also carries a small risk of introducing new races if done carelessly, which is the opposite of hardening.

## Items

### 5.1 — Embedding dedup on pull

**Location**: `packages/ns-desktop/src/lib/syncEngine.ts:660-665`

**Problem**: Every pulled note triggers `queueEmbeddingForNote` unconditionally. On a 100-note batch where only 5 actually changed, we queue 100 embedding jobs.

**Fix**:

- Store content hash on every note in local SQLite (reuse `local_file_hash` column or add `content_hash TEXT`)
- In `applyNoteChange`, compute incoming content hash; compare to stored hash
- Only queue embedding if hash differs
- Backfill hashes lazily (next time each note is touched)

**Impact**: Reduces OpenAI embedding API calls significantly on full re-sync. Minor CPU saving on hot paths.

### 5.2 — Image upload concurrency

**Location**: `packages/ns-desktop/src/lib/syncEngine.ts:385-418` (image branch of `pushChanges`)

**Problem**: Offline-queued images upload sequentially inside the push loop. For 10 pending uploads, the user waits 10× single-upload latency.

**Fix**:

- Batch image entries before the upload step
- Use a bounded `Promise.all` with concurrency ~3 (e.g., `p-limit` or a manual semaphore)
- Keep per-upload error handling intact — one failed upload doesn't block the batch

**Impact**: 3× faster bulk image upload in offline-queue flush scenarios.

### 5.3 — SSE reconnect thundering herd verification

**Location**: `packages/ns-desktop/src/lib/syncEngine.ts:187-196` (desktop) and mobile equivalent

**Problem**: Proactive SSE reconnect already has 10% jitter, but behavior under a mass reconnect (server restart, ISP outage recovery) is unverified. Risk: thundering herd if enough clients fire simultaneously.

**Fix**:

- Load-simulation test: 100 clients reconnect within a 60s window; assert max concurrent connections < 50% of total
- If test fails: bump jitter to 20% or add a random startup delay 0–30s on first post-outage reconnect
- Document the tuning rationale in the invariants doc

**Impact**: Prevents server-side saturation during mass reconnect events. Low probability today; becomes more important as user count grows.

### 5.4 — Pull delta compression

**Location**: wire protocol

**Problem**: Every note update sends the full content on every change. For a 100KB note where only a single character changed, this is wasteful.

**Fix (speculative)**:

- If profiling shows wire size is a bottleneck, add optional `content_delta` encoding using [diff-match-patch](https://github.com/google/diff-match-patch) or similar
- Client sends base hash + patch; server verifies hash matches its current version, applies patch
- On hash mismatch, fall back to full content

**Impact**: Likely premature. Only worth doing if telemetry shows the bandwidth problem is real.

### 5.5 — Pull batch size tuning

**Location**: `BATCH_LIMIT = 100` in both `sync.ts` and client sync engines

**Problem**: 100 is a guess. Larger batches mean fewer round trips but bigger payloads; smaller batches mean snappier first-paint on initial sync.

**Fix**:

- Measure pull latency distribution on prod
- Consider device-class tuning: mobile = 50, desktop = 200, web = 100
- Keep `hasMore` paging so no batch size breaks correctness

**Impact**: Minor. Only worth the ~2h of measurement + rollout if sync-latency complaints exist.

## Done criteria

Per item:
- 5.1: embedding API calls measurably reduced on full sync; existing tests pass
- 5.2: batch upload of 10 images completes in ≤4× single-upload time
- 5.3: load test confirms no herd; jitter documented
- 5.4: deferred unless bandwidth telemetry justifies it
- 5.5: deferred unless latency telemetry justifies it

## Out of scope

- Client-side caching optimizations (IndexedDB / SQLite query tuning) — separate effort
- Server query optimization beyond what Phase 4's composite indexes cover
- CDN / edge caching for static assets

## Dependencies

Phases 0–4 shipped and stable in production (so baseline metrics are trustworthy).
