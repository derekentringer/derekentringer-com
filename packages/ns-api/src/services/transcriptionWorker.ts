// Phase H — In-process transcription worker.
//
// The worker is the consumer of `transcription_jobs` rows. It pulls
// pending jobs, runs them through transcribe → structure → note-
// create, emits SSE on terminal status, and respects the configured
// concurrency caps. The implementation lives in step 3 of the
// Phase H rollout; this file currently exposes the interface the
// REST endpoints already need (`kickDispatcher`) so step-2 commits
// don't need to be revisited when step 3 lands.
//
// See docs/ns/mobile-parity-arch/phase-h-server-jobs.md.

import type { SseHub } from "../lib/sseHub.js";
import type { FastifyBaseLogger } from "fastify";

interface WorkerDeps {
  sseHub: SseHub;
  log: FastifyBaseLogger;
}

let workerDeps: WorkerDeps | null = null;

/** Wire the worker to its dependencies once at app startup. The
 *  REST handlers call `kickDispatcher` after creating a job; that
 *  call is a no-op until this is initialized so server boot order
 *  doesn't matter. */
export function initTranscriptionWorker(deps: WorkerDeps): void {
  workerDeps = deps;
}

/** Signal that there may be new work in the database. The worker
 *  drains pending rows up to the configured concurrency caps.
 *
 *  Stub for step 2 — logs and returns. Step 3 replaces this with
 *  the real dispatch loop. */
export function kickDispatcher(): void {
  if (!workerDeps) return;
  // TODO(phase-h step 3): in-process Promise queue with global +
  // per-user concurrency caps, transcribe → structure → note-create
  // pipeline, SSE emit on terminal status.
}
