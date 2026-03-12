import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

export const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB

function parseDuration(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const centiseconds = parseInt(match[4], 10);
  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

function parseProgressTime(stderr: string): number | null {
  // ffmpeg progress lines: "time=HH:MM:SS.cc" — take the last occurrence
  const matches = [...stderr.matchAll(/time=(\d+):(\d+):(\d+)\.(\d+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const hours = parseInt(last[1], 10);
  const minutes = parseInt(last[2], 10);
  const seconds = parseInt(last[3], 10);
  const centiseconds = parseInt(last[4], 10);
  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

export async function splitAudioIfNeeded(
  buffer: Buffer,
  filename: string,
): Promise<Buffer[]> {
  if (buffer.length <= MAX_CHUNK_SIZE) {
    return [buffer];
  }

  if (!ffmpegPath) {
    throw new Error("ffmpeg binary not found");
  }

  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : ".webm";
  const workDir = join(tmpdir(), `ns-audio-${randomUUID()}`);

  try {
    await mkdir(workDir, { recursive: true });

    const inputPath = join(workDir, `input${ext}`);
    await writeFile(inputPath, buffer);

    // Probe duration
    let stderr: string;
    try {
      const result = await execFileAsync(ffmpegPath, ["-i", inputPath], {
        timeout: 30_000,
      });
      stderr = result.stderr;
    } catch (err: unknown) {
      // ffmpeg exits with code 1 when just probing — stderr still has the info
      const execErr = err as { stderr?: string };
      if (!execErr.stderr) throw err;
      stderr = execErr.stderr;
    }

    let totalDuration = parseDuration(stderr);

    // WebM from MediaRecorder often has "Duration: N/A" — decode fully to get duration
    if (totalDuration === null) {
      try {
        const decodeResult = await execFileAsync(
          ffmpegPath,
          ["-i", inputPath, "-f", "null", "-"],
          { timeout: 120_000 },
        );
        totalDuration = parseProgressTime(decodeResult.stderr);
      } catch (err: unknown) {
        const execErr = err as { stderr?: string };
        if (execErr.stderr) {
          totalDuration = parseProgressTime(execErr.stderr);
        }
      }
    }

    if (totalDuration === null || totalDuration <= 0) {
      throw new Error("Could not determine audio duration from ffmpeg output");
    }

    const segmentDuration = Math.floor(
      (MAX_CHUNK_SIZE / buffer.length) * totalDuration,
    );

    // Split into segments
    const outputPattern = join(workDir, `chunk_%03d${ext}`);
    await execFileAsync(
      ffmpegPath,
      [
        "-i", inputPath,
        "-f", "segment",
        "-segment_time", String(segmentDuration),
        "-c", "copy",
        "-y",
        outputPattern,
      ],
      { timeout: 120_000 },
    );

    // Read segments
    const files = await readdir(workDir);
    const chunkFiles = files
      .filter((f) => f.startsWith("chunk_"))
      .sort();

    const chunks: Buffer[] = [];
    for (const chunkFile of chunkFiles) {
      chunks.push(await readFile(join(workDir, chunkFile)));
    }

    if (chunks.length === 0) {
      throw new Error("ffmpeg produced no output segments");
    }

    return chunks;
  } finally {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
