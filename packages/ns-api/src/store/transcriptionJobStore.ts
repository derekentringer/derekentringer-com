// Phase H — Server-managed transcription jobs.
//
// CRUD + dispatch helpers for the `transcription_jobs` table. The
// row is the source of truth for the entire transcribe → structure
// → note-create pipeline; the in-memory worker dispatches against
// it and the SSE hub emits deltas back to clients on terminal
// status. See docs/ns/mobile-parity-arch/phase-h-server-jobs.md.
import { getPrisma } from "../lib/prisma.js";
import type { TranscriptionJob as PrismaTranscriptionJob } from "../generated/prisma/client.js";

export type TranscriptionJobStatus =
  | "pending"
  | "transcribing"
  | "structuring"
  | "completed"
  | "failed";

export type TranscriptionJobMode =
  | "meeting"
  | "lecture"
  | "memo"
  | "verbatim";

/** Public-facing shape returned by the REST endpoints. Drops the
 *  internal-only telemetry columns; clients don't need them. */
export interface TranscriptionJobPublic {
  id: string;
  sessionId: string;
  status: TranscriptionJobStatus;
  mode: TranscriptionJobMode;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  transcript: string | null;
  structuredTitle: string | null;
  structuredContent: string | null;
  structuredTags: string[] | null;
  noteId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function toPublic(row: PrismaTranscriptionJob): TranscriptionJobPublic {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status as TranscriptionJobStatus,
    mode: row.mode as TranscriptionJobMode,
    audioMimeType: row.audioMimeType,
    audioSizeBytes: row.audioSizeBytes,
    transcript: row.transcript,
    structuredTitle: row.structuredTitle,
    structuredContent: row.structuredContent,
    structuredTags: Array.isArray(row.structuredTags)
      ? (row.structuredTags as string[])
      : null,
    noteId: row.noteId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

interface CreateOrReuseInput {
  userId: string;
  sessionId: string;
  mode: TranscriptionJobMode;
  audioR2Key?: string;
  audioMimeType?: string;
  audioSizeBytes?: number;
  // Web/desktop fast path: client already has the live transcript
  // accumulated; worker skips Whisper and goes straight to
  // structuring. Mutually exclusive with audio fields in practice
  // but the schema doesn't enforce it.
  prebuiltTranscript?: string;
}

/** Insert a new job, OR if a row already exists for this
 *  (userId, sessionId) — Retry semantics — reset its status to
 *  `pending`, clear the prior error, and update the audio/transcript
 *  fields. Returns the resulting row. */
export async function createOrReuseJob(
  input: CreateOrReuseInput,
): Promise<PrismaTranscriptionJob> {
  const prisma = getPrisma();
  const initialStatus: TranscriptionJobStatus = input.prebuiltTranscript
    ? "structuring"
    : "pending";
  return prisma.transcriptionJob.upsert({
    where: {
      userId_sessionId: {
        userId: input.userId,
        sessionId: input.sessionId,
      },
    },
    create: {
      userId: input.userId,
      sessionId: input.sessionId,
      mode: input.mode,
      status: initialStatus,
      audioR2Key: input.audioR2Key ?? null,
      audioMimeType: input.audioMimeType ?? null,
      audioSizeBytes: input.audioSizeBytes ?? null,
      transcript: input.prebuiltTranscript ?? null,
    },
    update: {
      // Retry path: reuse the row, blank the old failure state.
      status: initialStatus,
      mode: input.mode,
      audioR2Key: input.audioR2Key ?? null,
      audioMimeType: input.audioMimeType ?? null,
      audioSizeBytes: input.audioSizeBytes ?? null,
      transcript: input.prebuiltTranscript ?? null,
      errorMessage: null,
      structuredTitle: null,
      structuredContent: null,
      structuredTags: undefined,
      noteId: null,
      completedAt: null,
    },
  });
}

export async function getJob(
  userId: string,
  jobId: string,
): Promise<PrismaTranscriptionJob | null> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.findFirst({
    where: { id: jobId, userId },
  });
}

export async function getJobBySession(
  userId: string,
  sessionId: string,
): Promise<PrismaTranscriptionJob | null> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
  });
}

/** Recent jobs for a user. Used by clients on launch / connectivity
 *  restore to reconcile any state changes that arrived while
 *  offline. Capped to 100 to keep the response bounded. */
export async function listJobsSince(
  userId: string,
  since: Date,
): Promise<PrismaTranscriptionJob[]> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.findMany({
    where: { userId, updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function deleteJob(userId: string, jobId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.transcriptionJob.deleteMany({ where: { id: jobId, userId } });
}

interface PatchInput {
  status?: TranscriptionJobStatus;
  transcript?: string;
  structuredTitle?: string;
  structuredContent?: string;
  structuredTags?: string[];
  noteId?: string;
  errorMessage?: string | null;
  whisperSecondsUsed?: number;
  audioR2Key?: string | null;
  completedAt?: Date | null;
}

/** Worker uses this to update a job as it progresses through the
 *  pipeline. Always touches `updatedAt` (Prisma's `@updatedAt`
 *  handles it). Returns the updated row. */
export async function patchJob(
  jobId: string,
  patch: PatchInput,
): Promise<PrismaTranscriptionJob> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.update({
    where: { id: jobId },
    data: {
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.transcript !== undefined && { transcript: patch.transcript }),
      ...(patch.structuredTitle !== undefined && {
        structuredTitle: patch.structuredTitle,
      }),
      ...(patch.structuredContent !== undefined && {
        structuredContent: patch.structuredContent,
      }),
      ...(patch.structuredTags !== undefined && {
        structuredTags: patch.structuredTags,
      }),
      ...(patch.noteId !== undefined && { noteId: patch.noteId }),
      ...(patch.errorMessage !== undefined && {
        errorMessage: patch.errorMessage,
      }),
      ...(patch.whisperSecondsUsed !== undefined && {
        whisperSecondsUsed: patch.whisperSecondsUsed,
      }),
      ...(patch.audioR2Key !== undefined && { audioR2Key: patch.audioR2Key }),
      ...(patch.completedAt !== undefined && {
        completedAt: patch.completedAt,
      }),
    },
  });
}

/** Worker dispatch hot path — find pending jobs across all users,
 *  oldest first. The dispatcher then filters by per-user
 *  concurrency cap in memory before claiming. Returns up to `limit`
 *  rows so a single sweep can fill many free slots. */
export async function findPendingJobs(
  limit: number,
): Promise<PrismaTranscriptionJob[]> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.findMany({
    where: { status: { in: ["pending", "structuring"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/** Startup-resume sweep: jobs left in transient states whose
 *  `updatedAt` is older than `staleThreshold` are assumed
 *  abandoned (process restart, worker crash). Re-arm them as
 *  pending/structuring depending on how far they got. */
export async function findStaleJobs(
  staleThreshold: Date,
): Promise<PrismaTranscriptionJob[]> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.findMany({
    where: {
      status: { in: ["transcribing", "structuring"] },
      updatedAt: { lt: staleThreshold },
    },
    orderBy: { updatedAt: "asc" },
  });
}

/** Daily retention sweep: failed jobs older than `cutoff` whose
 *  audio is still in R2. Caller drops the R2 object then nulls
 *  `audioR2Key` (job row stays for telemetry). */
export async function findFailedJobsForAudioCleanup(
  cutoff: Date,
): Promise<PrismaTranscriptionJob[]> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.findMany({
    where: {
      status: "failed",
      audioR2Key: { not: null },
      updatedAt: { lt: cutoff },
    },
    orderBy: { updatedAt: "asc" },
  });
}

/** Count jobs currently in transient states for a single user.
 *  Drives the per-user concurrency cap in the dispatcher. */
export async function countActiveJobsForUser(userId: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.transcriptionJob.count({
    where: { userId, status: { in: ["transcribing", "structuring"] } },
  });
}

/** Patch upload telemetry. Called by the upload endpoint as the
 *  client reports duration / retries / bytes transferred. Optional
 *  metadata so missing fields don't trip up older clients. */
export async function patchUploadTelemetry(
  jobId: string,
  telemetry: {
    durationSeconds?: number;
    retryCount?: number;
    bytesTransferred?: bigint | number;
  },
): Promise<void> {
  const prisma = getPrisma();
  await prisma.transcriptionJob.update({
    where: { id: jobId },
    data: {
      ...(telemetry.durationSeconds !== undefined && {
        uploadDurationSeconds: telemetry.durationSeconds,
      }),
      ...(telemetry.retryCount !== undefined && {
        uploadRetryCount: telemetry.retryCount,
      }),
      ...(telemetry.bytesTransferred !== undefined && {
        uploadBytesTransferred: BigInt(telemetry.bytesTransferred),
      }),
    },
  });
}
