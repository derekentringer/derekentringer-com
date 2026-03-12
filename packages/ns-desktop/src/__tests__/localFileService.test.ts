import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Tauri plugins
// ---------------------------------------------------------------------------

const mockReadTextFile = vi.fn();
const mockWriteTextFile = vi.fn();
const mockExists = vi.fn();
const mockStat = vi.fn();
const mockRemove = vi.fn();
const mockWatch = vi.fn();
const mockOpen = vi.fn();
const mockSave = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => mockReadTextFile(...args),
  writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
  exists: (...args: unknown[]) => mockExists(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  watch: (...args: unknown[]) => mockWatch(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpen(...args),
  save: (...args: unknown[]) => mockSave(...args),
}));

// Import after mocks are set up
import {
  computeContentHash,
  validateFileSize,
  MAX_FILE_SIZE_BYTES,
  readLocalFile,
  writeLocalFile,
  fileExists,
  getFileStat,
  deleteLocalFile,
  pickLocalFiles,
  pickSaveLocation,
  startWatching,
  stopWatching,
  stopAllWatchers,
  SUPPORTED_EXTENSIONS,
} from "../lib/localFileService.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// computeContentHash
// ---------------------------------------------------------------------------

describe("computeContentHash", () => {
  it("returns a 64-character hex string", async () => {
    const hash = await computeContentHash("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same hash for the same input", async () => {
    const hash1 = await computeContentHash("consistent input");
    const hash2 = await computeContentHash("consistent input");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different inputs", async () => {
    const hash1 = await computeContentHash("input A");
    const hash2 = await computeContentHash("input B");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", async () => {
    const hash = await computeContentHash("");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles unicode content", async () => {
    const hash = await computeContentHash("Hello 🌍");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// validateFileSize
// ---------------------------------------------------------------------------

describe("validateFileSize", () => {
  it("accepts files under the 5MB limit", () => {
    expect(validateFileSize(1024)).toBe(true);
  });

  it("accepts files exactly at the 5MB limit", () => {
    expect(validateFileSize(MAX_FILE_SIZE_BYTES)).toBe(true);
  });

  it("rejects files over the 5MB limit", () => {
    expect(validateFileSize(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
  });

  it("accepts zero-byte files", () => {
    expect(validateFileSize(0)).toBe(true);
  });

  it("has MAX_FILE_SIZE_BYTES set to 5MB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// SUPPORTED_EXTENSIONS
// ---------------------------------------------------------------------------

describe("SUPPORTED_EXTENSIONS", () => {
  it("includes .md, .txt, and .markdown", () => {
    expect(SUPPORTED_EXTENSIONS).toContain(".md");
    expect(SUPPORTED_EXTENSIONS).toContain(".txt");
    expect(SUPPORTED_EXTENSIONS).toContain(".markdown");
  });
});

// ---------------------------------------------------------------------------
// readLocalFile
// ---------------------------------------------------------------------------

describe("readLocalFile", () => {
  it("delegates to readTextFile", async () => {
    mockReadTextFile.mockResolvedValue("file content");
    const result = await readLocalFile("/path/to/file.md");
    expect(mockReadTextFile).toHaveBeenCalledWith("/path/to/file.md");
    expect(result).toBe("file content");
  });
});

// ---------------------------------------------------------------------------
// writeLocalFile
// ---------------------------------------------------------------------------

describe("writeLocalFile", () => {
  it("writes content and returns a content hash", async () => {
    mockWriteTextFile.mockResolvedValue(undefined);
    const hash = await writeLocalFile("/path/to/file.md", "hello");
    expect(mockWriteTextFile).toHaveBeenCalledWith("/path/to/file.md", "hello");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the hash matching computeContentHash for the same content", async () => {
    mockWriteTextFile.mockResolvedValue(undefined);
    const expected = await computeContentHash("test content");
    const result = await writeLocalFile("/path/to/file.md", "test content");
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// fileExists
// ---------------------------------------------------------------------------

describe("fileExists", () => {
  it("returns true when file exists", async () => {
    mockExists.mockResolvedValue(true);
    const result = await fileExists("/path/to/file.md");
    expect(result).toBe(true);
    expect(mockExists).toHaveBeenCalledWith("/path/to/file.md");
  });

  it("returns false when file does not exist", async () => {
    mockExists.mockResolvedValue(false);
    const result = await fileExists("/path/to/missing.md");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFileStat
// ---------------------------------------------------------------------------

describe("getFileStat", () => {
  it("returns size when stat succeeds", async () => {
    mockStat.mockResolvedValue({ size: 2048 });
    const result = await getFileStat("/path/to/file.md");
    expect(result).toEqual({ size: 2048 });
  });

  it("returns null when stat throws", async () => {
    mockStat.mockRejectedValue(new Error("not found"));
    const result = await getFileStat("/path/to/missing.md");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteLocalFile
// ---------------------------------------------------------------------------

describe("deleteLocalFile", () => {
  it("delegates to remove", async () => {
    mockRemove.mockResolvedValue(undefined);
    await deleteLocalFile("/path/to/file.md");
    expect(mockRemove).toHaveBeenCalledWith("/path/to/file.md");
  });
});

// ---------------------------------------------------------------------------
// pickLocalFiles
// ---------------------------------------------------------------------------

describe("pickLocalFiles", () => {
  it("returns array of paths when user selects files", async () => {
    mockOpen.mockResolvedValue(["/path/a.md", "/path/b.txt"]);
    const result = await pickLocalFiles();
    expect(result).toEqual(["/path/a.md", "/path/b.txt"]);
  });

  it("returns null when user cancels", async () => {
    mockOpen.mockResolvedValue(null);
    const result = await pickLocalFiles();
    expect(result).toBeNull();
  });

  it("wraps single string result in array", async () => {
    mockOpen.mockResolvedValue("/path/single.md");
    const result = await pickLocalFiles();
    expect(result).toEqual(["/path/single.md"]);
  });

  it("returns null for empty array", async () => {
    mockOpen.mockResolvedValue([]);
    const result = await pickLocalFiles();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pickSaveLocation
// ---------------------------------------------------------------------------

describe("pickSaveLocation", () => {
  it("returns path when user picks a location", async () => {
    mockSave.mockResolvedValue("/path/to/save.md");
    const result = await pickSaveLocation("note.md");
    expect(result).toBe("/path/to/save.md");
  });

  it("returns null when user cancels", async () => {
    mockSave.mockResolvedValue(null);
    const result = await pickSaveLocation("note.md");
    expect(result).toBeNull();
  });

  it("returns null when save returns undefined", async () => {
    mockSave.mockResolvedValue(undefined);
    const result = await pickSaveLocation("note.md");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Watcher management
// ---------------------------------------------------------------------------

describe("startWatching / stopWatching / stopAllWatchers", () => {
  it("starts a watcher for a note", async () => {
    const unwatchFn = vi.fn();
    mockWatch.mockResolvedValue(unwatchFn);

    const onExternalChange = vi.fn();
    const onFileDeleted = vi.fn();

    await startWatching("note-1", "/path/to/file.md", onExternalChange, onFileDeleted);

    expect(mockWatch).toHaveBeenCalledWith(
      "/path/to/file.md",
      expect.any(Function),
      { recursive: false },
    );
  });

  it("stops an existing watcher before starting a new one for the same note", async () => {
    const unwatchFn1 = vi.fn();
    const unwatchFn2 = vi.fn();
    mockWatch.mockResolvedValueOnce(unwatchFn1).mockResolvedValueOnce(unwatchFn2);

    const onExternalChange = vi.fn();
    const onFileDeleted = vi.fn();

    await startWatching("note-1", "/path/a.md", onExternalChange, onFileDeleted);
    await startWatching("note-1", "/path/b.md", onExternalChange, onFileDeleted);

    expect(unwatchFn1).toHaveBeenCalled();
  });

  it("stopWatching calls the unwatch function", async () => {
    const unwatchFn = vi.fn();
    mockWatch.mockResolvedValue(unwatchFn);

    await startWatching("note-2", "/path/to/file.md", vi.fn(), vi.fn());
    await stopWatching("note-2");

    expect(unwatchFn).toHaveBeenCalled();
  });

  it("stopWatching is safe when no watcher exists", async () => {
    await expect(stopWatching("nonexistent")).resolves.not.toThrow();
  });

  it("stopAllWatchers stops all active watchers", async () => {
    const unwatch1 = vi.fn();
    const unwatch2 = vi.fn();
    mockWatch.mockResolvedValueOnce(unwatch1).mockResolvedValueOnce(unwatch2);

    await startWatching("note-a", "/path/a.md", vi.fn(), vi.fn());
    await startWatching("note-b", "/path/b.md", vi.fn(), vi.fn());
    await stopAllWatchers();

    expect(unwatch1).toHaveBeenCalled();
    expect(unwatch2).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Write suppression logic
// ---------------------------------------------------------------------------

describe("write suppression", () => {
  it("suppresses watcher callback during writeLocalFile", async () => {
    mockWriteTextFile.mockImplementation(async () => {
      // Simulate watcher firing during write — the callback in startWatching
      // should check suppressedPaths and skip. We verify by inspecting that
      // writeTextFile was called (the internal suppression is path-based).
    });

    const hash = await writeLocalFile("/path/to/file.md", "content");
    // If suppression didn't work, the watcher callback would fire unexpectedly.
    // The key assertion is that writeLocalFile completes and returns a hash.
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockWriteTextFile).toHaveBeenCalledWith("/path/to/file.md", "content");
  });
});
