# Phase H — Server-managed transcription jobs

**Goal**: decouple "user finishes recording on the client" from "transcription + structuring completes." After Phase H, an audio recording is uploaded once and the server owns everything else. Clients just observe job state via SSE.

## Why

Today's audio pipeline is client-coupled end-to-end: the client uploads audio over a synchronous HTTP request, holds the connection open while Whisper transcribes (minutes for a long recording), then the client locally creates the note. Three failure modes fall out of this:

1. **Long-recording timeout.** Mobile's `FileSystem.uploadAsync` has a fixed timeout. A 40-minute lecture's server-side Whisper roundtrip exceeds it; user sees `timeout (FileSystemLegacyModule)` even though the upload succeeded.
2. **App-quit data loss.** Quitting during processing destroys the in-flight HTTP request and the in-memory `processRecording` orchestration. The recording is lost permanently. Today's quit-guard dialogs ("recording in progress, quit anyway?") exist solely because of this.
3. **No cross-device propagation.** Recording on phone, wanting the note on desktop, requires the phone to stay open until the pipeline finishes.

Phase H fixes all three by making the server the source of truth for the transcription pipeline.

## Architecture

### `transcription_jobs` table (new)

```
id                   UUID PK
userId               UUID FK
sessionId            text       (client-generated UUID per recording)
status               enum       ('pending' | 'transcribing' | 'structuring' | 'completed' | 'failed')
mode                 enum       ('meeting' | 'lecture' | 'memo' | 'verbatim')
audioR2Key           text?      (null on the prebuiltTranscript fast path)
audioMimeType        text?
audioSizeBytes       int?
transcript           text?      (raw Whisper output OR client-supplied prebuiltTranscript)
structuredTitle      text?
structuredContent    text?
structuredTags       jsonb?
noteId               UUID FK?   (set when worker creates the Note)
errorMessage         text?
whisperSecondsUsed   int?       (cost telemetry)
uploadDurationSeconds int?      (client telemetry)
uploadRetryCount     int?       (client telemetry)
uploadBytesTransferred bigint?  (client telemetry — detect re-uploads)
createdAt            timestamptz
updatedAt            timestamptz
completedAt          timestamptz?

UNIQUE (userId, sessionId)      (Retry reuses the row)
INDEX (userId, status, updatedAt)
```

### Endpoints

```
POST   /ai/transcribe-jobs              multipart audio OR JSON {sessionId, mode, prebuiltTranscript}
                                        → {jobId, sessionId}  (returns immediately)
GET    /ai/transcribe-jobs/:id          → full job row
GET    /ai/transcribe-jobs?since=<iso>  → recent jobs for user (hydration on app launch)
POST   /ai/transcribe-jobs/:id/retry    → re-arm a failed job
DELETE /ai/transcribe-jobs/:id          → discard (drops row + R2 audio)
```

SSE event on existing sync stream: `event: transcription-job` with `{jobId, sessionId, status, ...delta}` on terminal status (`completed` / `failed`).

### Worker

In-process Promise queue (deferred BullMQ). Behavior:

- **Concurrency caps** (env-tunable):
  - `TRANSCRIPTION_MAX_CONCURRENT_GLOBAL=4` — total across all users on this pod
  - `TRANSCRIPTION_MAX_CONCURRENT_PER_USER=2` — fairness
- **Dispatch**: FIFO over pending jobs, with per-user eligibility check (skip user at cap).
- **Per-job pipeline**:
  1. If `audioR2Key` set → pull audio from R2 → `transcribeAudioChunked` → set `transcript`.
  2. If `transcript` already set (fast path) or just populated → `structureTranscript`.
  3. Create Note row server-side → set `noteId`.
  4. Status → `completed` → emit SSE → delete R2 audio.
- **Startup-resume sweep**: on process boot, find rows in `pending` / `transcribing` / `structuring` whose `updatedAt` is stale (>5 min) and re-queue them. Handles process restart mid-job.
- **Daily retention sweep** (cron-like setInterval, runs every 24h):
  - Failed jobs older than 7 days: drop R2 audio, keep job row (for telemetry).
  - Stale `transcribing` rows (>1 hour): mark `failed: "interrupted"`, retention applies.

### Server-side note creation

The worker writes the Note directly to Postgres. The existing sync engine propagates it to all clients on next pull. This is what gives Phase H its "survives client quit + cross-device" properties — note exists regardless of whether the originating client is alive.

### Web/desktop fast path

Live transcription chunks still flow through `/ai/transcribe-chunk` during recording (unchanged). At stop time:

- If accumulated live transcript >100 chars: client calls `POST /ai/transcribe-jobs` with JSON `{sessionId, mode, prebuiltTranscript}`. Worker skips Whisper, runs structuring + note creation only. Saves a Whisper call + minutes of latency.
- Otherwise: client uploads the audio file. Worker runs the full pipeline.

### Client upload phase

The only client-coupled window in the new architecture. Bytes need to leave the device.

- Single multipart upload with `onProgress`-driven progress bar on the meeting card.
- `pending_upload` row written locally at upload start; cleared on 2xx response.
- Client startup sweeps `pending_upload` rows and auto-retries from byte 0.
- **No quit-guard.** If user quits mid-upload, retry on next launch handles it. If they quit during transcribing/structuring, server keeps working.
- Resumable uploads (TUS / per-chunk) deferred to v2 if telemetry shows real pain.

### Cost guardrails

- `TRANSCRIPTION_MAX_DURATION_MINUTES=360` — 6-hour per-recording cap. Reject up front in `POST /ai/transcribe-jobs` if computed audio duration exceeds this.
- Per-user monthly minute cap deferred to a separate pricing/quotas phase.

### Provider

Stays on OpenAI Whisper. The provider-config layer (`whisperProvider` / `whisperApiUrl` / `whisperApiKey` / `whisperModel`) is already in place from groundwork — we can flip to Groq via env var when needed.

## What's intentionally NOT in this phase

- Live transcription on mobile (separate follow-up — needs a different audio capture library)
- Per-user monthly minute caps / quota enforcement (separate, pricing-tier work)
- BullMQ / dedicated worker process (revisit when in-process queue saturates)
- Migration of `/ai/transcribe-chunk` for live web/desktop chunks (left alone — works fine for short clips)
- Resumable uploads via TUS / per-chunk
- Live partial-transcript SSE streaming (terminal-status only for v1)

## Rollout order

1. ✅ Groundwork — chunked `/ai/transcribe-chunk` + Whisper provider config (`develop-ns-server-jobs` initial commit)
2. New doc (this file) + branch `develop-ns-server-jobs` off `develop-ns-mobile-parity`
3. ns-api: Prisma migration, endpoints, worker, retention sweep, telemetry, tests
4. ns-mobile: migrate `RecordingScreen.handleStop` → upload to `/ai/transcribe-jobs` + SSE listener; collapse `processRecording`; add upload progress; add `pending_upload` table + startup sweep + auto-retry
5. Smoke-test mobile (40-min, 5-hour, quit-during-upload, quit-during-processing, retry, discard)
6. ns-web: migrate stop flow; add `prebuiltTranscript` fast path; add upload progress; add `pending_upload` (localStorage); **remove `beforeunload` quit-guard**
7. ns-desktop: migrate stop flow; add `prebuiltTranscript` fast path; add upload progress; add `pending_upload` (SQLite); **remove `app-quit-requested` + `onCloseRequested` + `beforeunload` quit-guards + Rust-side machinery (`set_audio_work_state`, `quit_app`, `RunEvent::ExitRequested` handler, capabilities entries)**
8. Merge `develop-ns-server-jobs` → `develop-ns-mobile-parity`

## Cross-references

- Audio sync architecture: `docs/ns/sync-arch/README.md`
- Phase C audio capture: `docs/ns/mobile-parity-arch/phase-c-audio.md`
- Phase D images (image upload pattern reused for audio R2 uploads): `docs/ns/mobile-parity-arch/phase-d-images.md`
- Whisper provider config: `packages/ns-api/src/config.ts` (`whisperProvider` / `whisperApiUrl` / `whisperApiKey` / `whisperModel`)
- Audio chunker: `packages/ns-api/src/services/audioChunker.ts`
