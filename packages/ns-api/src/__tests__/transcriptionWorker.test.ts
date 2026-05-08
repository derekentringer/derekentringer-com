// Phase H — transcription worker tests.
//
// Mocks the external boundaries (R2 / Whisper / Claude / note
// creation / store helpers) and exercises the dispatcher +
// per-job pipeline. Verifies:
//   - happy path (audio + fast path)
//   - error paths (Whisper failure, note creation failure)
//   - concurrency caps (global, per-user)
//   - startup-resume sweep
//   - retention sweep (failed-audio cleanup, stuck-job force-fail)
//
// The worker uses queueMicrotask for dispatch — tests await
// `await new Promise(setImmediate)` to flush pending microtasks
// between assertions.
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import type { PassThrough } from "node:stream";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  mockPrisma = createMockPrisma();
});

const mockFetchAudio = vi.fn();
const mockDeleteAudio = vi.fn();
const mockTranscribeAudioChunked = vi.fn();
const mockStructureTranscript = vi.fn();
const mockCreateNote = vi.fn();

vi.mock("../services/r2Service.js", () => ({
  fetchAudio: (...args: unknown[]) => mockFetchAudio(...args),
  deleteAudio: (...args: unknown[]) => mockDeleteAudio(...args),
  uploadAudio: vi.fn(),
  buildAudioR2Key: vi.fn(),
}));

vi.mock("../services/whisperService.js", () => ({
  transcribeAudioChunked: (...args: unknown[]) =>
    mockTranscribeAudioChunked(...args),
}));

vi.mock("../services/aiService.js", () => ({
  structureTranscript: (...args: unknown[]) => mockStructureTranscript(...args),
}));

vi.mock("../store/noteStore.js", () => ({
  createNote: (...args: unknown[]) => mockCreateNote(...args),
}));

import {
  initTranscriptionWorker,
  kickDispatcher,
  runRetentionSweep,
  _resetWorkerStateForTests,
} from "../services/transcriptionWorker.js";

interface FakeSseHub {
  notify: ReturnType<typeof vi.fn>;
  notifyChat: ReturnType<typeof vi.fn>;
  notifyTranscriptionJob: ReturnType<typeof vi.fn>;
  addConnection: (
    userId: string,
    deviceId: string,
    stream: PassThrough,
  ) => void;
  removeConnection: (userId: string, stream: PassThrough) => void;
  cleanup: () => void;
  connectionCount: () => number;
}

function makeFakeHub(): FakeSseHub {
  return {
    notify: vi.fn(),
    notifyChat: vi.fn(),
    notifyTranscriptionJob: vi.fn(),
    addConnection: () => {},
    removeConnection: () => {},
    cleanup: () => {},
    connectionCount: () => 0,
  };
}

function makeFakeLog() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    silent: vi.fn(),
    child: () => makeFakeLog(),
    level: "info",
  } as unknown as Parameters<typeof initTranscriptionWorker>[0]["log"];
}

/** Wait for queued microtasks + a tick of the event loop so the
 *  async dispatch loop completes its current sweep. The worker
 *  pipeline has ~10 sequential awaits (fetchAudio → transcribe →
 *  patchJob → structureTranscript → createNote → patchJob →
 *  deleteAudio → patchJob → kickDispatcher → findMany →
 *  patchJob-claim → fetchAudio), so we flush enough ticks to
 *  drain the longest realistic chain. Overkill but cheap. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

interface FakeJobOverrides {
  id?: string;
  userId?: string;
  sessionId?: string;
  status?: string;
  mode?: string;
  audioR2Key?: string | null;
  audioMimeType?: string | null;
  audioSizeBytes?: number | null;
  transcript?: string | null;
  noteId?: string | null;
  errorMessage?: string | null;
  updatedAt?: Date;
}

function makeJob(overrides: FakeJobOverrides = {}) {
  return {
    id: overrides.id ?? "job-1",
    userId: overrides.userId ?? "user-1",
    sessionId: overrides.sessionId ?? "session-1",
    status: overrides.status ?? "pending",
    mode: overrides.mode ?? "lecture",
    audioR2Key: overrides.audioR2Key ?? "audio/user-1/session-1.m4a",
    audioMimeType: overrides.audioMimeType ?? "audio/mp4",
    audioSizeBytes: overrides.audioSizeBytes ?? 1024,
    transcript: overrides.transcript ?? null,
    structuredTitle: null,
    structuredContent: null,
    structuredTags: null,
    noteId: overrides.noteId ?? null,
    errorMessage: overrides.errorMessage ?? null,
    whisperSecondsUsed: null,
    uploadDurationSeconds: null,
    uploadRetryCount: null,
    uploadBytesTransferred: null,
    createdAt: new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    completedAt: null,
  };
}

describe("transcriptionWorker", () => {
  let hub: FakeSseHub;

  beforeEach(() => {
    vi.clearAllMocks();
    hub = makeFakeHub();
    // Default: no stale jobs at boot; dispatcher finds nothing
    // unless a test overrides.
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);
    mockPrisma.transcriptionJob.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...makeJob({ id: where.id }),
        ...data,
      }),
    );
    // Sensible service defaults
    mockTranscribeAudioChunked.mockResolvedValue("hello world transcript");
    mockStructureTranscript.mockResolvedValue({
      title: "Test Lecture",
      content: "structured content",
      tags: ["lecture"],
    });
    mockCreateNote.mockResolvedValue({
      id: "note-1",
      title: "Test Lecture",
      content: "structured content",
    });
    mockFetchAudio.mockResolvedValue(Buffer.from("fake audio bytes"));
    mockDeleteAudio.mockResolvedValue(undefined);
  });

  afterEach(() => {
    _resetWorkerStateForTests();
  });

  it("runs the full pipeline on a pending audio job", async () => {
    const job = makeJob({ id: "job-1" });
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([]); // boot sweep
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([job]); // dispatcher
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]); // subsequent passes

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();
    kickDispatcher();
    await flushAsync();

    expect(mockFetchAudio).toHaveBeenCalledWith("audio/user-1/session-1.m4a");
    expect(mockTranscribeAudioChunked).toHaveBeenCalled();
    expect(mockStructureTranscript).toHaveBeenCalledWith(
      "hello world transcript",
      "lecture",
    );
    expect(mockCreateNote).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Test Lecture",
        content: "structured content",
        tags: ["lecture"],
        audioMode: "lecture",
      }),
    );
    expect(mockDeleteAudio).toHaveBeenCalledWith("audio/user-1/session-1.m4a");
    // Sync notify so other devices pull the new note
    expect(hub.notify).toHaveBeenCalledWith("user-1");
    // Terminal SSE event
    expect(hub.notifyTranscriptionJob).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobId: "job-1",
        sessionId: "session-1",
        status: "completed",
        noteId: "note-1",
      }),
    );
  });

  it("uses the fast path (skips Whisper) when transcript is already set", async () => {
    const job = makeJob({
      id: "job-fast",
      status: "structuring",
      transcript: "prebuilt live transcript",
      audioR2Key: null,
    });
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([job]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();
    kickDispatcher();
    await flushAsync();

    expect(mockFetchAudio).not.toHaveBeenCalled();
    expect(mockTranscribeAudioChunked).not.toHaveBeenCalled();
    expect(mockStructureTranscript).toHaveBeenCalledWith(
      "prebuilt live transcript",
      "lecture",
    );
    expect(mockCreateNote).toHaveBeenCalled();
    expect(hub.notifyTranscriptionJob).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ status: "completed", noteId: "note-1" }),
    );
  });

  it("marks job failed when Whisper throws", async () => {
    const job = makeJob({ id: "job-whisper-fail" });
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([job]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);
    mockTranscribeAudioChunked.mockRejectedValue(
      new Error("Whisper API error (502)"),
    );

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();
    kickDispatcher();
    await flushAsync();

    expect(mockCreateNote).not.toHaveBeenCalled();
    expect(hub.notifyTranscriptionJob).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobId: "job-whisper-fail",
        status: "failed",
        errorMessage: expect.stringContaining("Whisper"),
      }),
    );
  });

  it("marks job failed when note creation throws", async () => {
    const job = makeJob({ id: "job-note-fail" });
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([job]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);
    mockCreateNote.mockRejectedValue(new Error("DB connection refused"));

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();
    kickDispatcher();
    await flushAsync();

    expect(hub.notifyTranscriptionJob).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("DB connection"),
      }),
    );
  });

  it("marks job failed when transcript is empty after Whisper", async () => {
    const job = makeJob({ id: "job-silent" });
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([job]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);
    mockTranscribeAudioChunked.mockResolvedValue("   ");

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();
    kickDispatcher();
    await flushAsync();

    expect(mockCreateNote).not.toHaveBeenCalled();
    expect(hub.notifyTranscriptionJob).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("No speech detected"),
      }),
    );
  });

  it("respects the per-user concurrency cap (default 2)", async () => {
    // Same user, three pending jobs. Worker should pick up the
    // first 2 then stop until one completes. Boot's
    // resumeStaleJobs.finally already calls kickDispatcher, so we
    // don't need an explicit kick — the post-boot pass + the
    // post-completion re-kick are the only dispatch cycles.
    const j1 = makeJob({ id: "j1" });
    const j2 = makeJob({ id: "j2" });
    const j3 = makeJob({ id: "j3" });
    mockPrisma.transcriptionJob.findMany
      .mockResolvedValueOnce([]) // boot sweep
      .mockResolvedValueOnce([j1, j2, j3]) // post-boot dispatch — claims j1, j2; j3 blocked
      .mockResolvedValueOnce([j3]) // post-j1-completion re-dispatch — j3 now unblocked
      .mockResolvedValue([]);

    // Make transcribe block until we let it through, so we can
    // observe the pre-completion state.
    let resolveT1: (v: string) => void = () => {};
    let resolveT2: (v: string) => void = () => {};
    mockTranscribeAudioChunked
      .mockImplementationOnce(() => new Promise<string>((r) => (resolveT1 = r)))
      .mockImplementationOnce(() => new Promise<string>((r) => (resolveT2 = r)))
      .mockResolvedValue("late transcript");

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();

    // Two jobs should be in flight (j1, j2). j3 is held back by
    // the per-user cap of 2.
    expect(mockFetchAudio).toHaveBeenCalledTimes(2);

    // Let the first finish — j3 should now be picked up.
    resolveT1("transcript 1");
    await flushAsync();
    expect(mockFetchAudio).toHaveBeenCalledTimes(3);

    resolveT2("transcript 2");
    await flushAsync();
  });

  it("respects the global concurrency cap (default 4) across users", async () => {
    // 5 jobs across 5 users — worker should pick up 4 (global cap)
    // then wait.
    const jobs = [
      makeJob({ id: "j1", userId: "u1", sessionId: "s1" }),
      makeJob({ id: "j2", userId: "u2", sessionId: "s2" }),
      makeJob({ id: "j3", userId: "u3", sessionId: "s3" }),
      makeJob({ id: "j4", userId: "u4", sessionId: "s4" }),
      makeJob({ id: "j5", userId: "u5", sessionId: "s5" }),
    ];
    mockPrisma.transcriptionJob.findMany
      .mockResolvedValueOnce([]) // boot sweep
      .mockResolvedValueOnce(jobs) // first dispatch — claims first 4
      .mockResolvedValueOnce([jobs[4]]) // after first completes, j5 still pending
      .mockResolvedValue([]);

    const releaseAll: ((v: string) => void)[] = [];
    mockTranscribeAudioChunked.mockImplementation(
      () => new Promise<string>((r) => releaseAll.push(r)),
    );

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();
    kickDispatcher();
    await flushAsync();

    expect(mockFetchAudio).toHaveBeenCalledTimes(4);

    // Release one → 5th should now run.
    releaseAll[0]("done 1");
    await flushAsync();
    expect(mockFetchAudio).toHaveBeenCalledTimes(5);

    for (const r of releaseAll) r("done");
    await flushAsync();
  });

  it("startup sweep resumes stale transcribing jobs", async () => {
    // Stale job — was transcribing 30 min ago but never completed.
    const stale = makeJob({
      id: "stale-1",
      status: "transcribing",
      transcript: null,
      updatedAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    // Boot sweep finds the stale row.
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([stale]);
    // Subsequent dispatcher polls return nothing (we're testing the
    // sweep + status reset, not the full run).
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();

    // Sweep should have reset the row's status.
    expect(mockPrisma.transcriptionJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stale-1" },
        data: expect.objectContaining({ status: "pending" }),
      }),
    );
  });

  it("startup sweep resumes a stale row at structuring when transcript is present", async () => {
    const stale = makeJob({
      id: "stale-2",
      status: "structuring",
      transcript: "already transcribed",
      updatedAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    mockPrisma.transcriptionJob.findMany.mockResolvedValueOnce([stale]);
    mockPrisma.transcriptionJob.findMany.mockResolvedValue([]);

    initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
    await flushAsync();

    expect(mockPrisma.transcriptionJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stale-2" },
        data: expect.objectContaining({ status: "structuring" }),
      }),
    );
  });

  describe("retention sweep", () => {
    it("drops audio for failed jobs older than the retention window", async () => {
      const oldFailed = makeJob({
        id: "old-failed",
        status: "failed",
        audioR2Key: "audio/user-1/session-1.m4a",
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.transcriptionJob.findMany
        .mockResolvedValueOnce([]) // boot sweep
        .mockResolvedValueOnce([]) // dispatcher (post-boot)
        .mockResolvedValueOnce([oldFailed]) // failed-audio cleanup
        .mockResolvedValueOnce([]); // stuck-job check

      initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
      await flushAsync();
      await runRetentionSweep();

      expect(mockDeleteAudio).toHaveBeenCalledWith(
        "audio/user-1/session-1.m4a",
      );
      expect(mockPrisma.transcriptionJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old-failed" },
          data: expect.objectContaining({ audioR2Key: null }),
        }),
      );
    });

    it("force-fails stuck transcribing jobs older than the active timeout", async () => {
      const stuck = makeJob({
        id: "stuck-1",
        status: "transcribing",
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      });
      mockPrisma.transcriptionJob.findMany
        .mockResolvedValueOnce([]) // boot sweep
        .mockResolvedValueOnce([]) // dispatcher (post-boot)
        .mockResolvedValueOnce([]) // failed-audio cleanup
        .mockResolvedValueOnce([stuck]); // stuck-job check

      initTranscriptionWorker({ sseHub: hub, log: makeFakeLog() });
      await flushAsync();
      await runRetentionSweep();

      expect(mockPrisma.transcriptionJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "stuck-1" },
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("Interrupted"),
          }),
        }),
      );
      expect(hub.notifyTranscriptionJob).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          status: "failed",
          errorMessage: expect.stringContaining("Interrupted"),
        }),
      );
    });
  });
});
