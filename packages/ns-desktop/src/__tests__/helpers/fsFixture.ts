import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Real-filesystem tmp dir for desktop tests. Pairs with MockWatcher
 * (see `./mockWatcher.ts`) to give Phase 3 reference tests a
 * deterministic way to exercise the watcher/suppression/reconciliation
 * codepaths without depending on a live Tauri runtime or on the
 * non-deterministic behavior of native FS events.
 *
 * Use the `using` declaration when possible:
 *   {
 *     const dir = await TmpDir.create();
 *     try { ... } finally { await dir.dispose(); }
 *   }
 *
 * Or in a beforeEach/afterEach pair.
 */
export class TmpDir {
  private constructor(public readonly path: string) {}

  static async create(prefix = "nsync-test-"): Promise<TmpDir> {
    const p = await mkdtemp(join(tmpdir(), prefix));
    return new TmpDir(p);
  }

  /** Absolute path to a file/dir name within this tmp dir. */
  file(name: string): string {
    return join(this.path, name);
  }

  /** Write a file. Creates parent dirs as needed. Returns absolute path. */
  async write(relPath: string, content: string): Promise<string> {
    const p = this.file(relPath);
    const parent = p.slice(0, p.lastIndexOf("/"));
    if (parent && parent !== this.path) {
      await mkdir(parent, { recursive: true });
    }
    await writeFile(p, content, "utf-8");
    return p;
  }

  /** Read a file by relative path. */
  async read(relPath: string): Promise<string> {
    return readFile(this.file(relPath), "utf-8");
  }

  /** Create a subdirectory (recursive). Returns absolute path. */
  async mkdir(relPath: string): Promise<string> {
    const p = this.file(relPath);
    await mkdir(p, { recursive: true });
    return p;
  }

  /** Delete a file or dir (recursive). Non-existence is not an error. */
  async remove(relPath: string): Promise<void> {
    await rm(this.file(relPath), { recursive: true, force: true });
  }

  /** True if a file/dir exists inside this tmp dir. */
  async exists(relPath: string): Promise<boolean> {
    try {
      await stat(this.file(relPath));
      return true;
    } catch {
      return false;
    }
  }

  /** Tear down the tmp dir and everything in it. Safe to call multiple times. */
  async dispose(): Promise<void> {
    await rm(this.path, { recursive: true, force: true });
  }
}

/** Compute SHA-256 hex hash of a string, matching localFileService.computeContentHash. */
export async function sha256Hex(content: string): Promise<string> {
  const { webcrypto } = await import("node:crypto");
  const data = new TextEncoder().encode(content);
  const hashBuffer = await webcrypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Wait for a condition to become true, polling every 10ms up to timeoutMs. */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 1000,
  intervalMs = 10,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
