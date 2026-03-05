import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ffmpeg-static", () => ({
  default: "/usr/bin/ffmpeg",
}));

import { execFile } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { splitAudioIfNeeded, MAX_CHUNK_SIZE } from "../services/audioChunker.js";

const mockExecFile = vi.mocked(execFile);
const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);
const mockRm = vi.mocked(rm);

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish default mock implementations after clearAllMocks
  mockRm.mockResolvedValue(undefined);
});

describe("audioChunker", () => {
  describe("splitAudioIfNeeded", () => {
    it("returns buffer unchanged when under MAX_CHUNK_SIZE", async () => {
      const smallBuffer = Buffer.alloc(1024, "a");
      const result = await splitAudioIfNeeded(smallBuffer, "test.webm");

      expect(result).toEqual([smallBuffer]);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("returns buffer unchanged at exactly MAX_CHUNK_SIZE", async () => {
      // Use a small buffer and override length to simulate MAX_CHUNK_SIZE
      const buf = Buffer.alloc(64, "a");
      Object.defineProperty(buf, "length", { value: MAX_CHUNK_SIZE });
      const result = await splitAudioIfNeeded(buf, "test.webm");

      expect(result).toEqual([buf]);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("splits large buffer into chunks via ffmpeg", async () => {
      // Create a small buffer but pretend it's larger than MAX_CHUNK_SIZE
      const largeBuffer = Buffer.alloc(128, "a");
      Object.defineProperty(largeBuffer, "length", {
        value: MAX_CHUNK_SIZE + 1024,
      });

      const chunk1 = Buffer.from("chunk1-data");
      const chunk2 = Buffer.from("chunk2-data");

      // First call: probe duration (ffmpeg -i exits with error but stderr has info)
      // Second call: segment command
      let callCount = 0;
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback?) => {
        const cb = typeof _opts === "function" ? _opts : callback;
        callCount++;
        if (callCount === 1) {
          // Probe: ffmpeg -i exits non-zero, duration in stderr
          const err = new Error("exit code 1") as Error & { stderr: string };
          err.stderr = "Duration: 00:05:30.50, start:";
          if (cb) (cb as Function)(err, "", "");
          else throw err;
        } else {
          // Segment: success
          if (cb) (cb as Function)(null, "", "");
        }
        return {} as ReturnType<typeof execFile>;
      });

      mockReaddir.mockResolvedValue([
        "input.webm",
        "chunk_000.webm",
        "chunk_001.webm",
      ] as unknown as Awaited<ReturnType<typeof readdir>>);

      mockReadFile.mockImplementation((path) => {
        const p = String(path);
        if (p.includes("chunk_000")) return Promise.resolve(chunk1);
        if (p.includes("chunk_001")) return Promise.resolve(chunk2);
        return Promise.reject(new Error("unexpected read"));
      });

      const result = await splitAudioIfNeeded(largeBuffer, "recording.webm");

      expect(result).toEqual([chunk1, chunk2]);
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it("cleans up temp files even on error", async () => {
      const largeBuffer = Buffer.alloc(128, "a");
      Object.defineProperty(largeBuffer, "length", {
        value: MAX_CHUNK_SIZE + 1024,
      });

      // Probe fails completely (no stderr)
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback?) => {
        const cb = typeof _opts === "function" ? _opts : callback;
        const err = new Error("ffmpeg not found");
        if (cb) (cb as Function)(err, "", "");
        else throw err;
        return {} as ReturnType<typeof execFile>;
      });

      await expect(
        splitAudioIfNeeded(largeBuffer, "test.webm"),
      ).rejects.toThrow();

      expect(mockRm).toHaveBeenCalledWith(
        expect.stringContaining("ns-audio-"),
        { recursive: true, force: true },
      );
    });

    it("extracts correct extension from filename", async () => {
      const smallBuffer = Buffer.alloc(100, "a");
      const result = await splitAudioIfNeeded(smallBuffer, "recording.mp4");

      expect(result).toEqual([smallBuffer]);
    });

    it("defaults to .webm extension when filename has no extension", async () => {
      const smallBuffer = Buffer.alloc(100, "a");
      const result = await splitAudioIfNeeded(smallBuffer, "recording");

      expect(result).toEqual([smallBuffer]);
    });
  });

  describe("MAX_CHUNK_SIZE", () => {
    it("is 24MB", () => {
      expect(MAX_CHUNK_SIZE).toBe(24 * 1024 * 1024);
    });
  });
});
