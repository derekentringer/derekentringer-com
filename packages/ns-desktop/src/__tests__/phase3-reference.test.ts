import { describe, it, expect, afterEach, vi } from "vitest";
import { TmpDir, sha256Hex } from "./helpers/fsFixture.ts";
import { MockWatcher } from "./helpers/mockWatcher.ts";

/**
 * Phase 3 reference tests — document silent data-loss bugs in the
 * desktop local-file and sync-apply paths. Marked `it.fails()` so the
 * current suite stays green while the bug exists; Phase 3 fixes flip
 * each to `it()` and they must pass.
 *
 * See docs/ns/sync-arch/04-phase-3-local-file-robustness.md for the
 * full spec of each bug.
 */

describe("Phase 3 reference: local file + sync-apply robustness", () => {
  let dir: TmpDir | null = null;
  const watcher = new MockWatcher();

  afterEach(async () => {
    await dir?.dispose();
    dir = null;
    watcher.reset();
    vi.resetModules();
    vi.doUnmock("@tauri-apps/plugin-fs");
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3.1 — Watcher suppression TOCTOU
  //
  // writeLocalFile adds the path to `suppressedPaths` for ~100ms after
  // write. During that window, watcher callbacks for that path are
  // silently dropped. If an external editor writes different content
  // during the window, its change is lost — the watcher would have
  // fired, but suppression ate it.
  //
  // Fix: hash-based dedup. The suppression check should compare the
  // current file's content hash against "what we last wrote" and only
  // drop events whose hash matches (i.e. were actually our own write).
  // External writes have different content → different hash → not
  // suppressed.
  // ─────────────────────────────────────────────────────────────────────

  it.fails(
    "3.1 — external write during self-write suppression window is not silently dropped",
    async () => {
      dir = await TmpDir.create();

      // Swap in the fsFixture for @tauri-apps/plugin-fs so we get real
      // file operations + a programmatic watcher.
      vi.doMock("@tauri-apps/plugin-fs", () => ({
        watch: watcher.bind(),
        readTextFile: async (p: string) => {
          const { readFile } = await import("node:fs/promises");
          return readFile(p, "utf-8");
        },
        writeTextFile: async (p: string, content: string) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(p, content, "utf-8");
        },
        exists: async (p: string) => {
          const { access } = await import("node:fs/promises");
          try {
            await access(p);
            return true;
          } catch {
            return false;
          }
        },
        stat: async (p: string) => {
          const { stat } = await import("node:fs/promises");
          const s = await stat(p);
          return { size: s.size, isDirectory: s.isDirectory(), isFile: s.isFile() };
        },
        remove: async (p: string) => {
          const { rm } = await import("node:fs/promises");
          await rm(p);
        },
        readDir: async () => [],
        rename: async () => {},
      }));

      const { startWatching, stopAllWatchers, suppressedPaths } = await import(
        "../lib/localFileService.ts"
      );

      const notePath = await dir.write("note.md", "initial content");

      const externalChanges: { content: string; hash: string }[] = [];
      await startWatching(
        "note-1",
        notePath,
        (_noteId, content, hash) => {
          externalChanges.push({ content, hash });
        },
        () => {},
      );

      // Simulate the first half of a self-write: mark suppression active.
      // (The real writeLocalFile does: add to suppressedPaths → write →
      // wait 100ms → remove. We inject the "mid-window" state directly
      // so the test is deterministic and doesn't race the 100ms timer.)
      suppressedPaths.add(notePath);

      // Within the window, an external editor writes completely
      // different content and the OS fires a change event.
      await dir.write("note.md", "external editor wrote this");
      await watcher.emit(notePath);

      // Self-write "completes" — suppression clears.
      suppressedPaths.delete(notePath);

      // Post-fix: the external change callback fired because its hash
      // didn't match any self-write hash for this path.
      // Today: the event was silently dropped because suppression is
      // time-window-based, not hash-based.
      expect(externalChanges).toHaveLength(1);
      expect(externalChanges[0].content).toBe("external editor wrote this");
      expect(externalChanges[0].hash).toBe(
        await sha256Hex("external editor wrote this"),
      );

      await stopAllWatchers();
    },
  );

  // ─────────────────────────────────────────────────────────────────────
  // 3.2 — Referential deferral on sync pull
  //
  // The desktop SQLite deliberately has no FK constraints on columns
  // populated from sync payloads (migrations 013, 014). That solved a
  // data-loss bug at the cost of silently accepting orphan references:
  // if an image pull delivers before the image's note (e.g. across a
  // BATCH_LIMIT boundary), the image is inserted with a dangling
  // note_id. If the note is soft-deleted on the server before its pull
  // arrives, the orphan remains in local SQLite forever.
  //
  // Fix: pending_refs SQLite table (migration 016). When an
  // upsertImageFromRemote arrives and its referenced note is not in
  // local SQLite, write to pending_refs instead of images. After each
  // successful note upsert, drain pending_refs entries whose ref_id
  // matches. Retry with an expiry (7 days) before dropping as permanent
  // orphan.
  //
  // TODO in Phase 3.2: swap this `it.todo` for a full `it.fails(...)`
  // test that uses the plugin-sql mock to assert:
  //   - upsertImageFromRemote with non-existent noteId does NOT insert
  //     into `images`
  //   - instead inserts into `pending_refs` with ref_type="note",
  //     ref_id=<noteId>
  //   - after upsertNoteFromRemote lands for that noteId, the image is
  //     materialized in `images` and the pending_refs row is removed
  //
  // Writing this test requires the `pending_refs` table to exist (it
  // doesn't yet), so the reference-test contract is captured in-phase
  // instead — once the migration lands, this test is authored alongside
  // the fix and must pass.
  // ─────────────────────────────────────────────────────────────────────

  it.todo(
    "3.2 — image pull referencing missing note defers via pending_refs (implement in Phase 3.2)",
  );
});
