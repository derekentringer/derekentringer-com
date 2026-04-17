import { readTextFile, writeTextFile, exists, stat, remove, watch, readDir } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import { parseFrontmatter, injectFrontmatter } from "@derekentringer/ns-shared";

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

// ---------------------------------------------------------------------------
// Directory watching
// ---------------------------------------------------------------------------

/** Directories/files to ignore when scanning or watching */
const IGNORED_NAMES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".DS_Store",
  "Thumbs.db",
  "node_modules",
  ".vscode",
  ".idea",
]);

function isIgnored(name: string): boolean {
  return name.startsWith(".") || IGNORED_NAMES.has(name);
}

export interface DirectoryWatcherCallbacks {
  /** A new supported file appeared in the directory */
  onFileCreated: (path: string) => void;
  /** An existing tracked file was modified */
  onFileModified: (path: string) => void;
  /** A file was deleted */
  onFileDeleted: (path: string) => void;
}

const directoryWatchers = new Map<string, UnwatchFn>();
const pendingEvents = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 200;

/**
 * Start a recursive watcher on a managed directory.
 * Events are debounced per-path to handle burst changes (e.g. git pull).
 */
export async function startDirectoryWatching(
  dirPath: string,
  callbacks: DirectoryWatcherCallbacks,
): Promise<void> {
  await stopDirectoryWatching(dirPath);

  const unwatch = await watch(
    dirPath,
    async (event) => {
      // Tauri watch event can be a single event or array
      const events = Array.isArray(event) ? event : [event];

      for (const ev of events) {
        const paths = Array.isArray(ev.paths) ? ev.paths : (ev as unknown as { path?: string }).path ? [(ev as unknown as { path: string }).path] : [];

        for (const filePath of paths) {
          if (!filePath || typeof filePath !== "string") continue;

          // Extract filename from path
          const parts = filePath.replace(/\\/g, "/").split("/");
          const fileName = parts[parts.length - 1];

          // Skip ignored files/directories
          if (isIgnored(fileName)) continue;

          // Only process supported file extensions
          if (!isSupportedExtension(filePath)) continue;

          // Skip suppressed paths (our own writes)
          if (suppressedPaths.has(filePath)) continue;

          // Debounce per-path
          const existing = pendingEvents.get(filePath);
          if (existing) clearTimeout(existing);

          pendingEvents.set(
            filePath,
            setTimeout(async () => {
              pendingEvents.delete(filePath);
              try {
                const fileStillExists = await exists(filePath);
                if (!fileStillExists) {
                  callbacks.onFileDeleted(filePath);
                } else {
                  // Check if this is a new file or modification
                  // The callback handler will determine this based on DB state
                  const s = await stat(filePath);
                  if (s.isFile) {
                    callbacks.onFileCreated(filePath);
                  }
                }
              } catch {
                // Ignore errors for individual file events
              }
            }, DEBOUNCE_MS),
          );
        }
      }
    },
    { recursive: true },
  );

  directoryWatchers.set(dirPath, unwatch);
}

/**
 * Stop watching a managed directory.
 */
export async function stopDirectoryWatching(dirPath: string): Promise<void> {
  const unwatch = directoryWatchers.get(dirPath);
  if (unwatch) {
    unwatch();
    directoryWatchers.delete(dirPath);
  }
  // Clear any pending debounced events for paths under this directory
  const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
  for (const [path, timer] of pendingEvents) {
    if (path.startsWith(prefix) || path === dirPath) {
      clearTimeout(timer);
      pendingEvents.delete(path);
    }
  }
}

/**
 * Stop all directory watchers.
 */
export async function stopAllDirectoryWatchers(): Promise<void> {
  for (const dirPath of Array.from(directoryWatchers.keys())) {
    await stopDirectoryWatching(dirPath);
  }
}

/**
 * Recursively scan a directory and return all supported file paths.
 * Respects ignore patterns and file size limits.
 * Used for startup reconciliation.
 */
export async function scanDirectory(dirPath: string): Promise<string[]> {
  const result: string[] = [];

  async function walk(p: string): Promise<void> {
    try {
      const entries = await readDir(p);
      for (const entry of entries) {
        if (isIgnored(entry.name)) continue;

        const childPath = p.endsWith("/") || p.endsWith("\\")
          ? `${p}${entry.name}`
          : `${p}/${entry.name}`;

        if (entry.isDirectory) {
          await walk(childPath);
        } else if (entry.isFile !== false && isSupportedExtension(entry.name)) {
          // Check file size
          try {
            const s = await stat(childPath);
            if (s.size <= MAX_FILE_SIZE_BYTES) {
              result.push(childPath);
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  await walk(dirPath);
  return result;
}

// ---------------------------------------------------------------------------
// Auto-indexing — create a note from a local file
// ---------------------------------------------------------------------------

/**
 * Derive a note title from a file path.
 * Strips the extension and replaces separators with spaces.
 */
export function titleFromFilename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const filename = parts[parts.length - 1];
  // Remove extension
  const dot = filename.lastIndexOf(".");
  const name = dot > 0 ? filename.slice(0, dot) : filename;
  // Replace dashes/underscores with spaces, trim
  return name.replace(/[-_]/g, " ").trim() || "Untitled";
}

export interface AutoIndexResult {
  noteId: string;
  title: string;
  isNew: boolean;
}

/**
 * Auto-index a file: read it, parse frontmatter, create a note in the database.
 * If the file has no frontmatter, inject a minimal block with title derived from filename.
 * Returns null if the file is already tracked or exceeds size limits.
 */
export async function autoIndexFile(
  filePath: string,
  createNoteFn: (data: {
    title: string;
    content: string;
    tags?: string[];
    folderId?: string;
    isLocalFile: boolean;
  }) => Promise<{ id: string; title: string }>,
  linkNoteFn: (noteId: string, localPath: string, hash: string) => Promise<void>,
  findByPathFn: (path: string) => Promise<{ id: string } | null>,
  folderId?: string,
): Promise<AutoIndexResult | null> {
  // Check if already tracked
  const existing = await findByPathFn(filePath);
  if (existing) return { noteId: existing.id, title: "", isNew: false };

  // Check file size
  try {
    const s = await stat(filePath);
    if (s.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[auto-index] Skipping large file (${s.size} bytes): ${filePath}`);
      return null;
    }
  } catch {
    return null;
  }

  // Read content
  let content: string;
  try {
    content = await readTextFile(filePath);
  } catch {
    return null;
  }

  // Parse frontmatter to extract metadata
  const { metadata } = parseFrontmatter(content);
  const title = metadata.title || titleFromFilename(filePath);
  const tags = metadata.tags;

  // If no frontmatter, inject a minimal block
  if (!content.startsWith("---")) {
    content = injectFrontmatter(content, {
      title,
    });
    // Write back the frontmatter-enriched content
    try {
      await writeTextFile(filePath, content);
    } catch {
      // Non-fatal — proceed with the content we have
    }
  }

  // Create the note
  const hash = await computeContentHash(content);
  const note = await createNoteFn({
    title,
    content,
    tags,
    folderId,
    isLocalFile: true,
  });

  // Link to local file
  await linkNoteFn(note.id, filePath, hash);

  return { noteId: note.id, title: note.title, isNew: true };
}

// ---------------------------------------------------------------------------
// Startup reconciliation for managed directories
// ---------------------------------------------------------------------------

export interface ReconciliationResult {
  dirPath: string;
  newFiles: number;
  missingFiles: number;
  changedFiles: number;
  totalFiles: number;
}

/**
 * Reconcile a managed directory against the database on startup.
 *
 * 1. Scan the directory for all supported files
 * 2. Compare against known local_path values in SQLite
 * 3. New files → auto-index
 * 4. Missing files → mark status as "missing"
 * 5. Changed files → report as "external_change"
 *
 * Returns a summary of what was found.
 */
export async function reconcileDirectory(
  dirPath: string,
  /** Get all notes with local_path under this directory */
  getTrackedNotes: () => Promise<{ id: string; localPath: string; localFileHash: string | null }[]>,
  /** Create a note from a file (auto-index) */
  createNoteFn: (data: {
    title: string;
    content: string;
    tags?: string[];
    folderId?: string;
    isLocalFile: boolean;
  }) => Promise<{ id: string; title: string }>,
  /** Link a note to its local file path */
  linkNoteFn: (noteId: string, localPath: string, hash: string) => Promise<void>,
  /** Check if a file is already tracked */
  findByPathFn: (path: string) => Promise<{ id: string } | null>,
  /** Called for files that changed while app was closed */
  onExternalChange?: (noteId: string, content: string, hash: string) => void,
  /** Called for files that went missing while app was closed */
  onFileMissing?: (noteId: string) => void,
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    dirPath,
    newFiles: 0,
    missingFiles: 0,
    changedFiles: 0,
    totalFiles: 0,
  };

  // 1. Scan the directory for all files on disk
  const filesOnDisk = await scanDirectory(dirPath);
  const filesOnDiskSet = new Set(filesOnDisk);
  result.totalFiles = filesOnDisk.length;

  // 2. Get all tracked notes for this directory
  const trackedNotes = await getTrackedNotes();
  const trackedPathSet = new Set(trackedNotes.map((n) => n.localPath));

  // 3. Find new files (on disk but not tracked)
  for (const filePath of filesOnDisk) {
    if (!trackedPathSet.has(filePath)) {
      try {
        const indexed = await autoIndexFile(
          filePath,
          createNoteFn,
          linkNoteFn,
          findByPathFn,
        );
        if (indexed?.isNew) result.newFiles++;
      } catch (err) {
        console.error(`[reconcile] Failed to auto-index ${filePath}:`, err);
      }
    }
  }

  // 4. Find missing files (tracked but not on disk) and changed files
  for (const note of trackedNotes) {
    if (!filesOnDiskSet.has(note.localPath)) {
      // File is missing
      result.missingFiles++;
      onFileMissing?.(note.id);
    } else if (note.localFileHash) {
      // File exists — check if content changed
      try {
        const content = await readTextFile(note.localPath);
        const currentHash = await computeContentHash(content);
        if (currentHash !== note.localFileHash) {
          result.changedFiles++;
          onExternalChange?.(note.id, content, currentHash);
        }
      } catch {
        // Can't read file — treat as missing
        result.missingFiles++;
        onFileMissing?.(note.id);
      }
    }
  }

  return result;
}

/**
 * Reconcile all managed directories on startup.
 * Returns aggregated results.
 */
export async function reconcileAllDirectories(
  directories: { path: string }[],
  getTrackedNotes: (dirPath: string) => Promise<{ id: string; localPath: string; localFileHash: string | null }[]>,
  createNoteFn: (data: {
    title: string;
    content: string;
    tags?: string[];
    folderId?: string;
    isLocalFile: boolean;
  }) => Promise<{ id: string; title: string }>,
  linkNoteFn: (noteId: string, localPath: string, hash: string) => Promise<void>,
  findByPathFn: (path: string) => Promise<{ id: string } | null>,
  onExternalChange?: (noteId: string, content: string, hash: string) => void,
  onFileMissing?: (noteId: string) => void,
): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];

  for (const dir of directories) {
    const result = await reconcileDirectory(
      dir.path,
      () => getTrackedNotes(dir.path),
      createNoteFn,
      linkNoteFn,
      findByPathFn,
      onExternalChange,
      onFileMissing,
    );
    results.push(result);

    if (result.newFiles > 0 || result.missingFiles > 0 || result.changedFiles > 0) {
      console.log(
        `[reconcile] ${dir.path}: ${result.newFiles} new, ${result.missingFiles} missing, ${result.changedFiles} changed (${result.totalFiles} total)`,
      );
    }
  }

  return results;
}
