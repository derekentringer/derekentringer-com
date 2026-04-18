# Phase 0 — Test Harness

## Goal

Build the test infrastructure required to verify Phases 2 and 3. Without this, transaction-abort, cursor-tie, and referential-deferral fixes cannot be meaningfully validated.

## Why this comes first

Current ns-api tests use `createMockPrisma()` (`packages/ns-api/src/__tests__/helpers/mockPrisma.ts`). Mock-based tests will not exercise:

- Real Postgres transaction semantics (a caught constraint violation leaves the tx in `in_failed_sql_transaction` state — mocks won't reproduce)
- Real index behavior (cursor tie pagination)
- FK propagation
- Concurrent client behavior

Phase 1 can proceed in parallel with Phase 0 since its changes are observable at the API / sync-wire layer and testable with existing mocks.

## Items

### 0.1 — Real-Postgres integration test runner

Dual-mode: testcontainers if no URL is provided, otherwise use the supplied `TEST_DATABASE_URL`. Lets local dev use ephemeral containers (when a container runtime is available) and CI use a pre-provisioned service container, without branching test code.

- `@testcontainers/postgresql` + `pg` installed as dev deps on `ns-api`
- `pgvector/pgvector:pg16` image baked in when containers are used
- Migrations applied via raw SQL (reads every `prisma/migrations/*/migration.sql` in order)
- New npm script: `npm run test:integration --workspace=@derekentringer/ns-api`
- Separate `vitest.integration.config.ts`; unit tests exclude the integration dir

**Env contract**:
| Env | Behavior |
|---|---|
| `TEST_DATABASE_URL` set | Use that URL directly; migrations assumed applied |
| `TEST_DATABASE_URL` unset | Spin pgvector testcontainer + apply migrations on startup |

**Local dev without Docker/OrbStack/Colima**: create a one-time `notesync_test` database on your existing local Postgres, run `npm run db:migrate:deploy` against it once, then `TEST_DATABASE_URL=postgresql://<user>@localhost:5432/notesync_test npm run test:integration -w @derekentringer/ns-api`.

**Local dev with a container runtime** (OrbStack recommended on Mac): just run `npm run test:integration -w @derekentringer/ns-api` — the container is ephemeral, no manual DB setup.

**CI**: provide `TEST_DATABASE_URL` pointing at the job's Postgres service container. Run migrations in a pre-step.

**File additions**:
- `packages/ns-api/vitest.integration.config.ts`
- `packages/ns-api/src/__tests__/integration/globalSetup.ts`
- `packages/ns-api/src/__tests__/integration/helpers/db.ts` — `getIntegrationPrisma()`, `resetDb()`
- `packages/ns-api/src/__tests__/integration/smoke.test.ts` — verifies harness wiring

### 0.2 — Two-client sync fixture

Helper that drives two in-memory sync clients against one server within a single test. Enables multi-device invariant assertions:

- Device A writes → Device B pulls → asserts state matches
- Device A and B both write same entity → assert LWW resolution
- Device A writes batch that triggers rejection → assert B's view is unaffected

**File addition**: `packages/ns-api/src/__tests__/integration/helpers/syncClient.ts`

### 0.3 — File-watcher test fixture (desktop)

The desktop file watcher is hard to test today because real FS events are non-deterministic. Needed:

- `tmp` dir creation + cleanup helper
- Controlled write operations (write + wait for event + assert)
- Event counter / spy wrappers around watcher callbacks

**File addition**: `packages/ns-desktop/src/__tests__/helpers/fsFixture.ts`

Constraint: Vitest + Tauri's fs API in test context. May need to run desktop FS tests in a separate `test:fs` script using a real filesystem.

## Edge cases the harness must support

- Constraint violations mid-transaction (FK, unique) — Phase 2.1
- Rows with identical `updatedAt` straddling `BATCH_LIMIT` boundary — Phase 2.2
- Clock skew between clients — Phase 2.3
- External write during self-write suppression window — Phase 3.1
- Child row arriving before parent in sync batch — Phase 3.2

## Done criteria

- `npm run test:integration --workspace=@derekentringer/ns-api` passes in CI
- Reference test written for each of the 5 edge cases above (tests expected to FAIL until the relevant phase fix lands)
- Two-client fixture has a working example asserting SSE-triggered pull

## Out of scope

- End-to-end Tauri webview tests (separate effort)
- Load / perf benchmarks (Phase 5)
