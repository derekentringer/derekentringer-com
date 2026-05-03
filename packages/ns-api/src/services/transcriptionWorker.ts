// Phase H — In-process transcription worker.
//
// The worker is the consumer of `transcription_jobs` rows. It pulls
// pending rows from the database, runs them through transcribe →
// structure → note-create, emits SSE on terminal status, and
// respects the configured concurrency caps:
//   - global: TRANSCRIPTION_MAX_CONCURRENT_GLOBAL (default 4)
//   - per-user: TRANSCRIPTION_MAX_CONCURRENT_PER_USER (default 2)
//
// Lifecycle on a single job:
//   pending      → claim → fetch audio from R2 → transcribeAudioChunked
//                  → patch transcript + status=structuring
//   structuring  → claim → structureTranscript → create Note
//                  → patch status=completed, noteId, delete R2 audio
//   any error    → patch status=failed + errorMessage
//   terminal     → emit SSE event: transcription-job
//
// Crash recovery: if the process restarts mid-job, the row is
// left in `transcribing` or `structuring`. On boot, a sweep finds
// rows whose updatedAt is stale (>STALE_THRESHOLD_MS) and resets
// their status so the dispatcher can pick them up again.
//
// Daily retention sweep:
//   - failed rows older than 7 days with audioR2Key set → drop R2,
//     null out audioR2Key (job row stays for telemetry).
//   - transcribing/structuring rows older than 1 hour → mark
//     failed: "interrupted" (caught between sweep cycles, but
//     bounded so a stuck row can't pin R2 audio forever).

import type { SseHub } from "../lib/sseHub.js";
import type { FastifyBaseLogger } from "fastify";
import {
  findPendingJobs,
  findStaleJobs,
  findFailedJobsForAudioCleanup,
  patchJob,
  type TranscriptionJobMode,
} from "../store/transcriptionJobStore.js";
import { fetchAudio, deleteAudio } from "./r2Service.js";
import { transcribeAudioChunked } from "./whisperService.js";
import { structureTranscript } from "./aiService.js";
import { createNote } from "../store/noteStore.js";
import { getPrisma } from "../lib/prisma.js";
import type { TranscriptionJob as PrismaTranscriptionJob } from "../generated/prisma/client.js";

interface WorkerDeps {
  sseHub: SseHub;
  log: FastifyBaseLogger;
}

const MAX_CONCURRENT_GLOBAL =
  Number(process.env.TRANSCRIPTION_MAX_CONCURRENT_GLOBAL) || 4;
const MAX_CONCURRENT_PER_USER =
  Number(process.env.TRANSCRIPTION_MAX_CONCURRENT_PER_USER) || 2;

/** A job is considered "stuck" by the startup sweep if its
 *  updatedAt is older than this. Generous default — Whisper on a
 *  long chunk + Claude structuring can each take minutes; we don't
 *  want to claw back a job that's actually still progressing. */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/** Daily retention sweep cadence. */
const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Failed job audio retention window. */
const FAILED_AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Active transcribing/structuring rows older than this are
 *  considered abandoned and force-failed by the retention sweep. */
const ACTIVE_JOB_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

let workerDeps: WorkerDeps | null = null;
let dispatching = false;
let retentionTimer: ReturnType<typeof setInterval> | null = null;

/** In-flight job state. Map value carries userId + promise so the
 *  dispatcher can compute per-user counts without a database round
 *  trip per check. */
const runningJobs = new Map<string, { userId: string; promise: Promise<void> }>();

/** Wire the worker to its dependencies once at app startup. Runs
 *  the startup-resume sweep + schedules the daily retention sweep,
 *  then kicks the dispatcher to drain any work that was already
 *  pending when the process started. */
export function initTranscriptionWorker(deps: WorkerDeps): void {
  workerDeps = deps;

  // Startup-resume sweep — re-arm any rows abandoned by a previous
  // process. Then dispatch.
  resumeStaleJobs()
    .catch((err) => deps.log.error({ err }, "Phase H startup sweep failed"))
    .finally(() => kickDispatcher());

  // Daily retention sweep on a setInterval. Unref so it doesn't
  // pin the event loop in tests.
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = setInterval(() => {
    runRetentionSweep().catch((err) =>
      deps.log.error({ err }, "Phase H retention sweep failed"),
    );
  }, RETENTION_SWEEP_INTERVAL_MS);
  if (retentionTimer.unref) retentionTimer.unref();
}

/** Signal that there may be new work in the database. The worker
 *  drains pending rows up to the configured concurrency caps. Safe
 *  to call repeatedly — `dispatching` re-entry guard ensures only
 *  one pass runs at a time, and each pass is bounded by the caps. */
export function kickDispatcher(): void {
  if (!workerDeps) return;
  if (dispatching) return;
  dispatching = true;
  // queueMicrotask so the caller's event loop slice finishes
  // before we hit the database. Avoids reentrant calls during
  // synchronous code paths.
  queueMicrotask(async () => {
    try {
      await dispatchPass();
    } catch (err) {
      workerDeps?.log.error({ err }, "Phase H dispatcher failed");
    } finally {
      dispatching = false;
    }
  });
}

async function dispatchPass(): Promise<void> {
  if (!workerDeps) return;
  while (runningJobs.size < MAX_CONCURRENT_GLOBAL) {
    // Pull a generous candidate window so we have options when
    // some users are at their per-user cap.
    const candidates = await findPendingJobs(MAX_CONCURRENT_GLOBAL * 4);
    let claimedThisPass = false;

    for (const job of candidates) {
      if (runningJobs.size >= MAX_CONCURRENT_GLOBAL) break;
      if (runningJobs.has(job.id)) continue;

      // Per-user cap — count in-memory only. Database state may
      // disagree if another worker process exists (we don't have
      // those in v1, but the in-memory count is conservative).
      const userActive = countRunningForUser(job.userId);
      if (userActive >= MAX_CONCURRENT_PER_USER) continue;

      // Claim by patching status. Race-safe enough for v1 (single
      // worker process); a multi-worker future would need
      // SELECT ... FOR UPDATE SKIP LOCKED.
      const nextStatus =
        job.status === "structuring" ? "structuring" : "transcribing";
      try {
        if (nextStatus !== job.status) {
          await patchJob(job.id, { status: nextStatus });
        }
      } catch (err) {
        workerDeps.log.warn({ err, jobId: job.id }, "Phase H claim failed");
        continue;
      }

      // Fire and forget — runJob updates the row + emits SSE on its
      // own. The .finally clause keeps `runningJobs` accurate.
      const claimed = { ...job, status: nextStatus };
      const promise = runJob(claimed).finally(() => {
        runningJobs.delete(job.id);
        // Slot freed up — wake the dispatcher in case more work
        // is queued.
        kickDispatcher();
      });
      runningJobs.set(job.id, { userId: job.userId, promise });
      claimedThisPass = true;
    }

    // If we couldn't claim anything this pass (every pending row
    // is either already running or its user is at cap), bail.
    // The next kickDispatcher call after a job completes will
    // re-evaluate.
    if (!claimedThisPass) break;
  }
}

function countRunningForUser(userId: string): number {
  let count = 0;
  for (const entry of runningJobs.values()) {
    if (entry.userId === userId) count++;
  }
  return count;
}

async function runJob(job: PrismaTranscriptionJob): Promise<void> {
  if (!workerDeps) return;
  const log = workerDeps.log;

  try {
    // ── Phase 1: transcribe (skipped on the prebuiltTranscript fast path) ──
    let transcript: string;
    let whisperSecondsUsed: number | undefined;
    if (job.transcript && job.transcript.trim().length > 0) {
      transcript = job.transcript;
      log.info(
        { jobId: job.id, transcriptLength: transcript.length },
        "Phase H — using prebuilt transcript, skipping Whisper",
      );
    } else {
      if (!job.audioR2Key) {
        throw new Error("Job has no audioR2Key and no prebuiltTranscript");
      }
      const audioBuffer = await fetchAudio(job.audioR2Key);
      const t0 = Date.now();
      transcript = await transcribeAudioChunked(
        audioBuffer,
        `${job.sessionId}.${guessExtFromMime(job.audioMimeType)}`,
        log,
      );
      whisperSecondsUsed = Math.ceil((Date.now() - t0) / 1000);
      // Persist the transcript + whisper telemetry now so a crash
      // between transcribe and structure doesn't lose the Whisper
      // output (which is the expensive part).
      await patchJob(job.id, {
        transcript,
        whisperSecondsUsed,
        status: "structuring",
      });
    }

    if (transcript.trim().length === 0) {
      throw new Error("No speech detected in the recording");
    }

    // ── Phase 2: structure ──
    const structured = await structureTranscript(
      transcript,
      job.mode as TranscriptionJobMode,
    );

    // ── Phase 3: create the Note ──
    const note = await createNote(job.userId, {
      title: structured.title || "Untitled Recording",
      content: structured.content || transcript,
      tags: structured.tags ?? [],
      audioMode: job.mode as TranscriptionJobMode,
    });

    // ── Phase 4: terminal patch + delete R2 audio + SSE ──
    const completed = await patchJob(job.id, {
      status: "completed",
      noteId: note.id,
      structuredTitle: structured.title || undefined,
      structuredContent: structured.content || undefined,
      structuredTags: structured.tags ?? [],
      completedAt: new Date(),
      errorMessage: null,
    });

    // Audio is no longer needed — the transcript + structured
    // fields are on the row, and the Note exists in Postgres.
    if (job.audioR2Key) {
      try {
        await deleteAudio(job.audioR2Key);
        await patchJob(job.id, { audioR2Key: null });
      } catch (err) {
        // Non-fatal — daily retention sweep will catch it.
        log.warn(
          { err, jobId: job.id, audioR2Key: job.audioR2Key },
          "Phase H R2 cleanup failed on success path",
        );
      }
    }

    // Sync notify so other devices see the new note on next pull.
    workerDeps.sseHub.notify(job.userId);
    workerDeps.sseHub.notifyTranscriptionJob(job.userId, {
      jobId: completed.id,
      sessionId: completed.sessionId,
      status: "completed",
      noteId: note.id,
    });

    log.info(
      { jobId: job.id, noteId: note.id, whisperSecondsUsed },
      "Phase H job completed",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    log.error({ err, jobId: job.id }, "Phase H job failed");
    try {
      const failed = await patchJob(job.id, {
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      });
      workerDeps.sseHub.notifyTranscriptionJob(job.userId, {
        jobId: failed.id,
        sessionId: failed.sessionId,
        status: "failed",
        errorMessage: message,
      });
    } catch (patchErr) {
      log.error(
        { err: patchErr, jobId: job.id },
        "Phase H failed to mark job as failed",
      );
    }
  }
}

function guessExtFromMime(mime: string | null): string {
  if (!mime) return "bin";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

/** Startup-resume sweep — find rows in transient states whose
 *  updatedAt is stale and reset them so the dispatcher will pick
 *  them up again. Status reset depends on how far the previous run
 *  got: a transcribing row with no transcript → pending; a row
 *  with a transcript present → structuring (skip the expensive
 *  Whisper step we already paid for). */
async function resumeStaleJobs(): Promise<void> {
  if (!workerDeps) return;
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
  const stale = await findStaleJobs(cutoff);
  if (stale.length === 0) return;
  workerDeps.log.info(
    { count: stale.length },
    "Phase H resuming stale jobs from previous process",
  );
  for (const job of stale) {
    const nextStatus =
      job.transcript && job.transcript.trim().length > 0
        ? "structuring"
        : "pending";
    try {
      await patchJob(job.id, { status: nextStatus });
    } catch (err) {
      workerDeps.log.warn({ err, jobId: job.id }, "Phase H resume patch failed");
    }
  }
}

/** Daily retention sweep:
 *   - failed rows older than 7 days with audioR2Key set → drop R2,
 *     null audioR2Key.
 *   - transcribing/structuring rows older than 1 hour without an
 *     in-memory entry → mark failed: "interrupted".
 *
 *  Exported for testing. */
export async function runRetentionSweep(): Promise<void> {
  if (!workerDeps) return;
  const log = workerDeps.log;

  // Failed audio cleanup.
  const failedCutoff = new Date(Date.now() - FAILED_AUDIO_RETENTION_MS);
  const failedJobs = await findFailedJobsForAudioCleanup(failedCutoff);
  for (const job of failedJobs) {
    if (!job.audioR2Key) continue;
    try {
      await deleteAudio(job.audioR2Key);
      await patchJob(job.id, { audioR2Key: null });
      log.info(
        { jobId: job.id, audioR2Key: job.audioR2Key },
        "Phase H retention sweep — dropped failed-job audio",
      );
    } catch (err) {
      log.warn(
        { err, jobId: job.id, audioR2Key: job.audioR2Key },
        "Phase H retention sweep — R2 delete failed; will retry tomorrow",
      );
    }
  }

  // Stuck active jobs — older than ACTIVE_JOB_TIMEOUT_MS and not
  // currently running in-memory.
  const stuckCutoff = new Date(Date.now() - ACTIVE_JOB_TIMEOUT_MS);
  const prisma = getPrisma();
  const stuck = await prisma.transcriptionJob.findMany({
    where: {
      status: { in: ["transcribing", "structuring"] },
      updatedAt: { lt: stuckCutoff },
    },
  });
  for (const job of stuck) {
    if (runningJobs.has(job.id)) continue;
    try {
      await patchJob(job.id, {
        status: "failed",
        errorMessage: "Interrupted — please tap Retry",
        completedAt: new Date(),
      });
      workerDeps.sseHub.notifyTranscriptionJob(job.userId, {
        jobId: job.id,
        sessionId: job.sessionId,
        status: "failed",
        errorMessage: "Interrupted — please tap Retry",
      });
      log.info(
        { jobId: job.id },
        "Phase H retention sweep — marked stuck job as failed",
      );
    } catch (err) {
      log.warn(
        { err, jobId: job.id },
        "Phase H retention sweep — failed to mark stuck job",
      );
    }
  }
}

/** Visible for tests. */
export function _resetWorkerStateForTests(): void {
  workerDeps = null;
  dispatching = false;
  runningJobs.clear();
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}
