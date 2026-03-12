import { readTextFile, writeTextFile, exists, stat, remove, watch, readDir } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const SUPPORTED_EXTENSIONS = [".md", ".txt", ".markdown"];
export const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalFileStatus = "synced" | "cloud_newer" | "external_change" | "missing";
type UnwatchFn = () => void;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const watchers = new Map<string, UnwatchFn>();
const suppressedPaths = new Set<string>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Core file operations
// ---------------------------------------------------------------------------

export async function readLocalFile(path: string): Promise<string> {
  return readTextFile(path);
}

export async function writeLocalFile(path: string, content: string): Promise<string> {
  suppressedPaths.add(path);
  try {
    await writeTextFile(path, content);
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    suppressedPaths.delete(path);
  }
  return computeContentHash(content);
}

export async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fileExists(path: string): Promise<boolean> {
  return exists(path);
}

export async function getFileStat(path: string): Promise<{ size: number } | null> {
  try {
    const info = await stat(path);
    return { size: info.size };
  } catch {
    return null;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory;
  } catch {
    return false;
  }
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_BYTES;
}

export async function deleteLocalFile(path: string): Promise<void> {
  await remove(path);
}

// ---------------------------------------------------------------------------
// File picker dialogs
// ---------------------------------------------------------------------------

export async function pickLocalFiles(): Promise<string[] | null> {
  const result = await open({
    multiple: true,
    filters: [
      {
        name: "Supported Files",
        extensions: SUPPORTED_EXTENSIONS.map((ext) => ext.replace(".", "")),
      },
    ],
  });

  if (!result) return null;

  // open() returns string | string[] | null depending on `multiple`
  if (Array.isArray(result)) {
    return result.length > 0 ? result : null;
  }
  return [result];
}

export async function pickSaveLocation(defaultName: string): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters: [
      {
        name: "Markdown",
        extensions: ["md"],
      },
    ],
  });

  return result ?? null;
}

// ---------------------------------------------------------------------------
// Dropped path expansion (folders → individual file paths)
// ---------------------------------------------------------------------------

function isSupportedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Given a list of paths (files and/or directories), recursively expand
 * directories and return only supported file paths.
 */
export async function collectFilePaths(paths: string[]): Promise<string[]> {
  const result: string[] = [];

  async function walk(p: string): Promise<void> {
    try {
      const s = await stat(p);
      if (s.isDirectory) {
        const entries = await readDir(p);
        for (const entry of entries) {
          const childPath = p.endsWith("/") || p.endsWith("\\")
            ? `${p}${entry.name}`
            : `${p}/${entry.name}`;
          await walk(childPath);
        }
      } else if (s.isFile && isSupportedExtension(p)) {
        result.push(p);
      }
    } catch {
      // skip unreadable entries
    }
  }

  for (const p of paths) {
    await walk(p);
  }
  return result;
}

// ---------------------------------------------------------------------------
// File watching
// ---------------------------------------------------------------------------

export async function startWatching(
  noteId: string,
  path: string,
  onExternalChange: (noteId: string, content: string, hash: string) => void,
  onFileDeleted: (noteId: string) => void,
): Promise<void> {
  // Stop any existing watcher for this note
  await stopWatching(noteId);

  const unwatch = await watch(
    path,
    async () => {
      if (suppressedPaths.has(path)) return;

      const fileStillExists = await exists(path);
      if (!fileStillExists) {
        onFileDeleted(noteId);
        return;
      }

      const content = await readTextFile(path);
      const hash = await computeContentHash(content);
      onExternalChange(noteId, content, hash);
    },
    { recursive: false },
  );

  watchers.set(noteId, unwatch);
}

export async function stopWatching(noteId: string): Promise<void> {
  const unwatch = watchers.get(noteId);
  if (unwatch) {
    unwatch();
    watchers.delete(noteId);
  }
}

export async function stopAllWatchers(): Promise<void> {
  const noteIds = Array.from(watchers.keys());
  for (const noteId of noteIds) {
    await stopWatching(noteId);
  }
}

// ---------------------------------------------------------------------------
// Startup — reestablish watchers
// ---------------------------------------------------------------------------

export async function reestablishWatchers(
  localFileNotes: { id: string; localPath: string; localFileHash: string | null }[],
  onExternalChange: (noteId: string, content: string, hash: string) => void,
  onFileDeleted: (noteId: string) => void,
): Promise<{ noteId: string; status: LocalFileStatus }[]> {
  const results: { noteId: string; status: LocalFileStatus }[] = [];

  for (const note of localFileNotes) {
    const fileStillExists = await exists(note.localPath);

    if (!fileStillExists) {
      results.push({ noteId: note.id, status: "missing" });
      continue;
    }

    await startWatching(note.id, note.localPath, onExternalChange, onFileDeleted);

    const content = await readTextFile(note.localPath);
    const currentHash = await computeContentHash(content);

    if (note.localFileHash && currentHash !== note.localFileHash) {
      results.push({ noteId: note.id, status: "external_change" });
    } else {
      results.push({ noteId: note.id, status: "synced" });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Poll backup
// ---------------------------------------------------------------------------

export function startPollTimer(
  getWatchedNotes: () => { noteId: string; path: string; hash: string | null }[],
  onExternalChange: (noteId: string, content: string, hash: string) => void,
  onFileDeleted: (noteId: string) => void,
): void {
  stopPollTimer();

  pollTimer = setInterval(async () => {
    const notes = getWatchedNotes();

    for (const note of notes) {
      const fileStillExists = await exists(note.path);

      if (!fileStillExists) {
        onFileDeleted(note.noteId);
        continue;
      }

      const content = await readTextFile(note.path);
      const currentHash = await computeContentHash(content);

      if (note.hash && currentHash !== note.hash) {
        onExternalChange(note.noteId, content, currentHash);
      }
    }
  }, POLL_INTERVAL_MS);
}

export function stopPollTimer(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
