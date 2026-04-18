import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  getIntegrationPrisma,
  resetDb,
  disconnectIntegrationPrisma,
} from "./helpers/db.js";
import {
  createSyncClient,
  createTwoDeviceSetup,
  noteChange,
} from "./helpers/syncClient.js";

/**
 * Phase 2 reference tests — document three silent data-loss bugs in the
 * cross-platform sync protocol. Each test is marked `it.fails(...)` so
 * the current suite is green while the bug exists; Phase 2 fixes flip
 * each to `it(...)` and they must pass.
 *
 * See docs/ns/sync-arch/03-phase-2-sync-correctness.md for the full spec
 * of each bug + its intended fix.
 */

describe("Phase 2 reference: sync correctness bugs", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    getIntegrationPrisma();
    const { buildApp } = await import("../../app.js");
    app = buildApp({ disableRateLimit: true });
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await disconnectIntegrationPrisma();
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2.1 — Push transaction abort cascade
  //
  // When one change in a batch raises a Postgres constraint violation,
  // the surrounding $transaction is put in `in_failed_sql_transaction`
  // state. Every subsequent statement fails until ROLLBACK. Today this
  // is caught by the per-change try/catch and mis-reported as an
  // individual rejection — worse, the whole transaction rolls back at
  // commit, so the changes that "applied" earlier are also lost.
  //
  // Fix: per-change transactions or explicit SAVEPOINTs.
  // ─────────────────────────────────────────────────────────────────────

  it(
    "2.1 — FK violation mid-batch does not cascade-fail surrounding changes",
    async () => {
      const client = await createSyncClient(app);

      const okA = noteChange({
        action: "create",
        data: { title: "A" },
      });
      const orphan = noteChange({
        action: "create",
        data: {
          title: "orphan",
          // Force an FK violation: folderId points at a folder that doesn't exist
          folderId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        },
      });
      const okC = noteChange({
        action: "create",
        data: { title: "C" },
      });

      const res = await client.push([okA, orphan, okC]);

      // Expected post-fix:
      //   A and C applied, orphan rejected with fk_constraint
      expect(res.applied).toBe(2);
      expect(res.rejected).toBe(1);
      expect(res.rejections?.[0]?.changeId).toBe(orphan.id);
      expect(res.rejections?.[0]?.reason).toBe("fk_constraint");

      // Both A and C must actually be persisted (currently everything
      // rolls back because the tx is poisoned)
      const prisma = getIntegrationPrisma();
      const notes = await prisma.note.findMany({
        where: { userId: client.user.id },
        orderBy: { title: "asc" },
      });
      expect(notes.map((n) => n.title)).toEqual(["A", "C"]);
    },
  );

  // ─────────────────────────────────────────────────────────────────────
  // 2.2 — Pull cursor ties
  //
  // Pull uses `updatedAt > cursor` with BATCH_LIMIT=100. Rows sharing a
  // single updatedAt value can straddle the batch boundary: first pull
  // returns 100 rows (last one at T), cursor becomes T, second pull's
  // strict-greater-than predicate skips any remaining rows also at T.
  //
  // Fix: keyset pagination on (updatedAt, id).
  // ─────────────────────────────────────────────────────────────────────

  it(
    "2.2 — rows with identical updatedAt straddling BATCH_LIMIT boundary are not skipped",
    async () => {
      const client = await createSyncClient(app);
      const prisma = getIntegrationPrisma();

      const when = new Date("2026-01-01T00:00:00Z");
      const expectedIds = new Set<string>();
      for (let i = 0; i < 150; i++) {
        const id = randomUUID();
        expectedIds.add(id);
        await prisma.note.create({
          data: {
            id,
            userId: client.user.id,
            title: `note-${i.toString().padStart(3, "0")}`,
            content: "",
            tags: [],
            // All 150 rows get the same updatedAt — this is what creates
            // the tie that today's cursor math can't handle
            createdAt: when,
            updatedAt: when,
          },
        });
      }

      // Drain all pages. Stop after a safety cap so a broken cursor
      // doesn't hang the test.
      const seenIds = new Set<string>();
      let cursor: string | undefined;
      let lastIds: { notes?: string; folders?: string; images?: string; tombstones?: string } | undefined;
      for (let page = 0; page < 10; page++) {
        const res = await client.pull(cursor, lastIds);
        for (const change of res.changes) {
          seenIds.add(change.id);
        }
        cursor = res.cursor.lastSyncedAt;
        lastIds = res.cursor.lastIds;
        if (!res.hasMore) break;
      }

      expect(seenIds.size).toBe(150);
      expect([...expectedIds].every((id) => seenIds.has(id))).toBe(true);
    },
  );

  // ─────────────────────────────────────────────────────────────────────
  // 2.3 — Clock-skew LWW
  //
  // LWW compares `change.timestamp` (client-supplied wall-clock) to
  // `existing.updatedAt` (server wall-clock). A device with a clock
  // that's slow by minutes-to-hours stamps its causally-later writes
  // with timestamps in the past — server rejects them as
  // timestamp_conflict and the writes are silently lost.
  //
  // (Server already @updatedAt-stamps its own side, so fast-clock
  // clients don't win over future writes — that case works correctly.
  // The broken direction is slow-clock clients losing writes.)
  //
  // Fix: server-authoritative updatedAt for LWW comparisons (rather
  // than trusting client-supplied change.timestamp), plus Lamport-style
  // (deviceId, seq) causal ordering for tie-break within the same
  // server-observed instant.
  // ─────────────────────────────────────────────────────────────────────

  it(
    "2.3 — slow-clock client's causally-later write is not silently rejected as stale",
    async () => {
      const { a, b } = await createTwoDeviceSetup(app);

      const noteId = randomUUID();
      const realNow = Date.now();

      // Device A (correct clock): creates at real-now. Server stamps
      // updatedAt = server-now (real-now-ish).
      const aPush = await a.push([
        noteChange({
          action: "create",
          id: noteId,
          data: { title: "A-create" },
          timestamp: new Date(realNow).toISOString(),
        }),
      ]);
      expect(aPush.applied).toBe(1);

      // Device B has a clock running 1 hour slow. It pulls A's note,
      // then edits — but its local timestamp for the edit is "1h ago"
      // because that's what its clock thinks "now" is.
      const oneHourSlow = new Date(realNow - 60 * 60 * 1000);
      const bPush = await b.push([
        noteChange({
          action: "update",
          id: noteId,
          data: { title: "B-update (slow clock, causally later)" },
          timestamp: oneHourSlow.toISOString(),
        }),
      ]);

      // Post-fix: B's write applies — it's causally after A's even
      // though its wall-clock timestamp is before A's. Today it's
      // rejected as timestamp_conflict and silently lost.
      expect(bPush.applied).toBe(1);
      expect(bPush.rejections ?? []).toEqual([]);

      const prisma = getIntegrationPrisma();
      const note = await prisma.note.findUnique({ where: { id: noteId } });
      expect(note?.title).toBe("B-update (slow clock, causally later)");
    },
  );
});
