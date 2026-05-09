-- Phase H — Server-managed transcription jobs.
-- See docs/ns/mobile-parity-arch/phase-h-server-jobs.md
CREATE TABLE "transcription_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL,
    "audioR2Key" TEXT,
    "audioMimeType" TEXT,
    "audioSizeBytes" INTEGER,
    "transcript" TEXT,
    "structuredTitle" TEXT,
    "structuredContent" TEXT,
    "structuredTags" JSONB,
    "noteId" TEXT,
    "errorMessage" TEXT,
    "whisperSecondsUsed" INTEGER,
    "uploadDurationSeconds" INTEGER,
    "uploadRetryCount" INTEGER,
    "uploadBytesTransferred" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "transcription_jobs_pkey" PRIMARY KEY ("id")
);

-- Retry reuses the row — client sends the same sessionId on retry.
CREATE UNIQUE INDEX "transcription_jobs_userId_sessionId_key" ON "transcription_jobs"("userId", "sessionId");

-- Worker dispatch hot path: "find next pending/transcribing job for any user
-- under their per-user concurrency cap" filters by (userId, status).
CREATE INDEX "transcription_jobs_userId_status_idx" ON "transcription_jobs"("userId", "status");

-- Status sweeps (startup-resume + daily retention sweep) filter by
-- (status, updatedAt) to find stale rows.
CREATE INDEX "transcription_jobs_status_updatedAt_idx" ON "transcription_jobs"("status", "updatedAt");

ALTER TABLE "transcription_jobs"
  ADD CONSTRAINT "transcription_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
