import { describe, it, expect, afterEach, vi } from "vitest";
import { TmpDir, sha256Hex, waitFor } from "./fsFixture.ts";
import { MockWatcher } from "./mockWatcher.ts";

describe("TmpDir", () => {
  let dir: TmpDir | null = null;

  afterEach(async () => {
    await dir?.dispose();
    dir = null;
  });

  it("creates an isolated tmp directory", async () => {
    dir = await TmpDir.create();
    expect(dir.path).toContain("nsync-test-");
    expect(await dir.exists("")).toBe(true);
  });

  it("write + read + exists round trip", async () => {
    dir = await TmpDir.create();
    const absPath = await dir.write("hello.md", "# hi");
    expect(absPath).toBe(dir.file("hello.md"));
    expect(await dir.read("hello.md")).toBe("# hi");
    expect(await dir.exists("hello.md")).toBe(true);
    expect(await dir.exists("missing.md")).toBe(false);
  });

  it("creates parent dirs for nested writes", async () => {
    dir = await TmpDir.create();
    await dir.write("nested/deep/file.md", "content");
    expect(await dir.read("nested/deep/file.md")).toBe("content");
  });

  it("remove is idempotent", async () => {
    dir = await TmpDir.create();
    await dir.write("f.md", "x");
    await dir.remove("f.md");
    expect(await dir.exists("f.md")).toBe(false);
    await dir.remove("f.md"); // no-op, no throw
  });

  it("dispose cleans up completely", async () => {
    dir = await TmpDir.create();
    await dir.write("a.md", "a");
    const capturedPath = dir.path;
    await dir.dispose();
    dir = null;
    const { access } = await import("node:fs/promises");
    await expect(access(capturedPath)).rejects.toThrow();
  });
});

describe("sha256Hex", () => {
  it("matches localFileService.computeContentHash shape (64 hex chars)", async () => {
    const h = await sha256Hex("hello world");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await sha256Hex("same input");
    const b = await sha256Hex("same input");
    expect(a).toBe(b);
  });
});

describe("MockWatcher", () => {
  it("registers + fires exact-path watchers", async () => {
    const w = new MockWatcher();
    const watch = w.bind();

    const events: string[] = [];
    const unwatch = await watch("/tmp/foo", (e) => {
      events.push(...e.paths);
    });

    await w.emit("/tmp/foo");
    expect(events).toEqual(["/tmp/foo"]);

    await w.emit("/tmp/other");
    expect(events).toEqual(["/tmp/foo"]); // other path not matched

    unwatch();
    await w.emit("/tmp/foo");
    expect(events).toEqual(["/tmp/foo"]); // unregistered, no fire
  });

  it("recursive watchers match descendants", async () => {
    const w = new MockWatcher();
    const watch = w.bind();

    const events: string[] = [];
    await watch(
      "/tmp/root",
      (e) => {
        events.push(...e.paths);
      },
      { recursive: true },
    );

    await w.emit("/tmp/root/a/b.md");
    await w.emit("/tmp/root/c.md");
    await w.emit("/tmp/other");
    expect(events).toEqual(["/tmp/root/a/b.md", "/tmp/root/c.md"]);
  });

  it("reset clears all registrations", async () => {
    const w = new MockWatcher();
    await w.bind()("/tmp/x", () => {});
    await w.bind()("/tmp/y", () => {});
    expect(w.registrationCount()).toBe(2);
    w.reset();
    expect(w.registrationCount()).toBe(0);
  });
});

describe("waitFor", () => {
  it("resolves when condition becomes true", async () => {
    let flag = false;
    setTimeout(() => {
      flag = true;
    }, 50);
    await waitFor(() => flag, 500);
    expect(flag).toBe(true);
  });

  it("rejects on timeout", async () => {
    await expect(waitFor(() => false, 50)).rejects.toThrow(/timed out/);
  });
});

// --- Integration: fixture drives localFileService through the mock ---

describe("fixture integration with localFileService", () => {
  let dir: TmpDir | null = null;
  const watcher = new MockWatcher();

  afterEach(async () => {
    await dir?.dispose();
    dir = null;
    watcher.reset();
    vi.restoreAllMocks();
  });

  it("real file on disk + mocked watcher drives startWatching end-to-end", async () => {
    dir = await TmpDir.create();

    // Mock plugin-fs so startWatching's watch() + readTextFile hit our tmp dir.
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

    const { startWatching, stopAllWatchers } = await import(
      "../../lib/localFileService.ts"
    );

    const path = await dir.write("note.md", "original");

    const received: { noteId: string; content: string; hash: string }[] = [];
    const deleted: string[] = [];

    await startWatching(
      "note-1",
      path,
      (noteId, content, hash) => {
        received.push({ noteId, content, hash });
      },
      (noteId) => {
        deleted.push(noteId);
      },
    );

    // Simulate an external editor writing new content + firing the watcher
    await dir.write("note.md", "edited");
    await watcher.emit(path);

    expect(received).toHaveLength(1);
    expect(received[0].noteId).toBe("note-1");
    expect(received[0].content).toBe("edited");
    expect(received[0].hash).toBe(await sha256Hex("edited"));

    await stopAllWatchers();
  });
});
