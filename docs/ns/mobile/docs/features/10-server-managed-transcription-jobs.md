# 10 — Server-Managed Transcription Jobs (Phase H)

**Status:** Complete (Phase H steps 1–7 shipped via `develop-ns-server-jobs` → `develop-ns-mobile-parity`)
**Priority:** High
**Architecture plan:** [`docs/ns/mobile-parity-arch/phase-h-server-jobs.md`](../../../mobile-parity-arch/phase-h-server-jobs.md)

## Summary

Decouples "user finishes recording on the client" from "transcription + structuring completes." After Phase H, an audio recording is uploaded once and the server owns everything else; clients just observe job state via SSE. Survives client quit, works cross-device.

## Architecture

The client posts a recorded audio chunk to `/ai/transcription-jobs`, gets a `jobId`, and stops worrying about the pipeline. A server-side worker (`transcriptionWorker`) picks up `pending` jobs, runs Whisper, structures via Claude, creates the Note row, deletes the R2 audio, and emits an SSE event on each transition. Clients reconcile via SSE + a periodic orphan-card sweep that flips stuck `processing` chat cards to `failed` after their grace window.

## Sub-phases

### Step 1 — Schema + store helpers (b168fe0)

Prisma migration adds `transcription_jobs` table (id, userId, status, audioR2Key, mode, attempts, error, noteId, createdAt, updatedAt) plus `chat_cards.processing_job_id` reference. SQLite mirrors the schema for offline mobile state.

### Step 2 — REST endpoints + R2 audio + SSE (a62849f)

`POST /ai/transcription-jobs` accepts the multipart audio, validates magic bytes, uploads to R2 under `audio/{userId}/{sessionId}.{ext}`, inserts a `pending` row, returns `{ jobId }`. `GET /ai/transcription-jobs/:id` returns current state. SSE `event: transcription-job` broadcasts status transitions.

### Step 3 — Worker + retention sweep (f02d7e1)

In-process polling worker (`initTranscriptionWorker` in `app.ts`):

1. Pull next `pending` job, mark `transcribing`.
2. Whisper transcribe → mark `structuring`.
3. Claude structure → create Note row, set `noteId`.
4. Status → `completed` → emit SSE → delete R2 audio.

Retention sweep runs every 24 h: deletes `completed` job rows older than retention period and orphaned R2 audio. Startup-resume sweep on boot finds rows in `pending`/`transcribing`/`structuring` with `updatedAt` >5 min old and re-queues them so a process restart mid-job recovers cleanly.

### Step 4 — Mobile migration (6afdd92, 9e83cdb)

Mobile recording stop flow now POSTs to `/ai/transcription-jobs` instead of running the chunked-transcribe pipeline client-side. Chat card written immediately with `processing_job_id`; SSE updates flip it to "Meeting Ended" with the structured note attached.

### Step 5 — Worker dispatch tests (9e83cdb)

Vitest coverage for the worker: dispatch ordering, retention sweep, orphan reconcile, error-path retries on transient Whisper / Claude failures.

### Step 6+7 — Web + desktop migration (ebe1cc3)

`ns-web` and `ns-desktop` migrated to the same server-managed flow. The recording bar's "Stop" still completes locally, but instead of waiting on Whisper/Claude end-to-end, it uploads the audio chunk and lets the server finish. Cross-device: the user can stop a recording on phone and see the structured note appear on desktop a minute later without ever touching the phone again.

### Mic-only notice + capture badge (ad112d9)

Mobile-specific UX: a one-time modal on the first mic-only recording explaining that meeting/system audio capture is desktop-only, plus a "Mic Capture" badge on the recording bar so the source is always visible.

## What this fixes

1. **Stop-and-quit reliability** — closing the app or backgrounding mid-pipeline no longer abandons the transcription. The server completes it.
2. **Cross-device delivery** — note appears on every signed-in client via the existing sync engine, not tied to the device that recorded.
3. **Long meetings** — Whisper / Claude work happens on the server's network, not over a flaky phone connection. Mobile timeouts that used to drop hour-long meetings disappear.

## Operational hooks

- `transcriptionWorker.kickDispatcher()` — manual prod for the dispatch loop (used by REST handler to wake up immediately on new job).
- Orphan-card sweep (`reconcileAllOrphanMeetingCards`) runs every 60 s in `app.ts`; flips processing cards stuck past their grace window to `failed` and notifies via SSE so connected devices refetch.
- Retention period configurable via env var (default: keep `completed` job rows for X days, then purge).
