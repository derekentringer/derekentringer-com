# Phase 0 — Test Harness

**Status**: ✅ Complete (commits `2875425`…`6f0ab0f` on `develop-sync-arch-hardening`)

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

### 0.2 — User / device / auth fixtures

- `createTestUser(opts)` — inserts a real User row with a bcrypt-hashed password (cost 4)
- `createTestDevice(userId, opts)` — allocates a deviceId; optionally seeds a `SyncCursor` row
- `authHeaderFor(user)` / `authHeaderForId(id)` — signs a JWT matching the `/auth/login` shape so auth-guarded routes accept it

**File addition**: `packages/ns-api/src/__tests__/integration/helpers/users.ts`

### 0.3 — Two-client sync fixture

Drives two in-process sync clients through `app.inject` so multi-device tests read naturally: `const { a, b } = await createTwoDeviceSetup(app); await a.push([…]); const pulled = await b.pull();`.

- `SyncClient` interface with `push()` / `pull()` helpers
- `createSyncClient({ user? })` for single-device setups; `createTwoDeviceSetup()` shorthand
- `noteChange` / `folderChange` / `imageChange` constructors fill in defaults so tests only specify the fields they care about

**File addition**: `packages/ns-api/src/__tests__/integration/helpers/syncClient.ts`

### 0.4 — Desktop file-watcher fixture

Real-filesystem tmp dirs + a programmatic stand-in for `@tauri-apps/plugin-fs`'s `watch()`. Phase 3 reference tests drive the watcher/suppression/reconciliation codepaths deterministically — no dependency on native FS events.

- `TmpDir` class with create/write/read/mkdir/remove/exists/dispose (real Node fs)
- `sha256Hex(content)` matching `localFileService.computeContentHash` shape
- `waitFor(cond, timeoutMs)` polling helper
- `MockWatcher` — `vi.mock`-friendly, with `emit()` to fire synthetic events; exact-path + recursive matching

**File additions**:
- `packages/ns-desktop/src/__tests__/helpers/fsFixture.ts`
- `packages/ns-desktop/src/__tests__/helpers/mockWatcher.ts`

### 0.5 — Phase 2 & 3 reference tests

`it.fails()` tests that document the bugs Phases 2 and 3 will fix. Today they fail (as expected); once fixes land they flip to `it()` and must pass.

- `packages/ns-api/src/__tests__/integration/phase2-reference.test.ts` — 3 tests (tx abort, cursor ties, slow-clock LWW)
- `packages/ns-desktop/src/__tests__/phase3-reference.test.ts` — 1 `it.fails` (watcher TOCTOU) + 1 `it.todo` (referential deferral, authored in-phase once migration 016 exists)

## Commands

From the repo root:

```bash
# ns-api integration tests (uses testcontainer if Docker/OrbStack is available)
npx turbo run test:integration
# or scoped to just ns-api:
npm run test:integration --workspace=@derekentringer/ns-api

# Unit tests (unchanged; mockPrisma-based)
npx turbo run test
```

Desktop fixture tests run as part of the normal `test` task:

```bash
npm run test --workspace=@derekentringer/ns-desktop
```

## Edge cases the harness supports

- Constraint violations mid-transaction (FK, unique) — Phase 2.1 ✅ reference test written
- Rows with identical `updatedAt` straddling `BATCH_LIMIT` boundary — Phase 2.2 ✅
- Slow-clock client LWW — Phase 2.3 ✅
- External write during self-write suppression window — Phase 3.1 ✅
- Child row arriving before parent in sync batch — Phase 3.2 (deferred to in-phase — requires `pending_refs` schema)

## Done criteria — actual results

- ✅ `npm run test:integration` + `npx turbo run test:integration` green (22 tests, ~10s warm)
- ✅ Desktop fixture tests green (13 tests, ~1.5s)
- ✅ 4 of 5 edge cases have `it.fails` reference tests; the 5th is an `it.todo` with an in-file implementation plan
- ✅ Two-client fixture verified via `syncClient.test.ts` (7 multi-device scenarios)

## Out of scope

- End-to-end Tauri webview tests (separate effort)
- Load / perf benchmarks (Phase 5)
- CI wiring with a Postgres service container (hand off to CI work when Phase 2/3 code lands — the harness supports both modes already via `TEST_DATABASE_URL`)
