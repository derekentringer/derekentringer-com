import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetConfig } from "../config.js";

vi.mock("../services/audioChunker.js", () => ({
  splitAudioIfNeeded: vi.fn(),
}));

import { splitAudioIfNeeded } from "../services/audioChunker.js";

const mockSplit = vi.mocked(splitAudioIfNeeded);

beforeEach(() => {
  resetConfig();
  process.env.NODE_ENV = "test";
  process.env.OPENAI_API_KEY = "sk-test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  resetConfig();
});

describe("whisperService", () => {
  it("calls Whisper API with correct model and auth", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello world" }), { status: 200 }),
    );

    const { transcribeAudio } = await import("../services/whisperService.js");
    const result = await transcribeAudio(Buffer.from("audio-data"), "test.webm");

    expect(result).toBe("Hello world");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((options as RequestInit).method).toBe("POST");
    expect((options as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer sk-test-key" }),
    );

    const body = (options as RequestInit).body as FormData;
    expect(body.get("model")).toBe("whisper-1");
  });

  it("returns transcript text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "Transcribed audio content" }), { status: 200 }),
    );

    const { transcribeAudio } = await import("../services/whisperService.js");
    const result = await transcribeAudio(Buffer.from("data"), "recording.webm");

    expect(result).toBe("Transcribed audio content");
  });

  it("throws on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const { transcribeAudio } = await import("../services/whisperService.js");

    await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
      "Whisper API error (401): Unauthorized",
    );
  });
});

describe("transcribeAudioChunked", () => {
  it("transcribes single chunk when audio is small", async () => {
    const buf = Buffer.from("small-audio");
    mockSplit.mockResolvedValue([buf]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello world" }), { status: 200 }),
    );

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    const result = await transcribeAudioChunked(buf, "test.webm");

    expect(result).toBe("Hello world");
    expect(mockSplit).toHaveBeenCalledWith(buf, "test.webm");
  });

  it("concatenates transcripts from multiple chunks with space", async () => {
    const chunk1 = Buffer.from("chunk1");
    const chunk2 = Buffer.from("chunk2");
    const chunk3 = Buffer.from("chunk3");
    mockSplit.mockResolvedValue([chunk1, chunk2, chunk3]);

    let callIdx = 0;
    const texts = ["First part.", "Second part.", "Third part."];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const text = texts[callIdx++];
      return new Response(JSON.stringify({ text }), { status: 200 });
    });

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    const result = await transcribeAudioChunked(Buffer.from("large"), "recording.webm");

    expect(result).toBe("First part. Second part. Third part.");
  });

  it("transcribes chunks in parallel and preserves order", async () => {
    const chunks = Array.from({ length: 5 }, (_, i) => Buffer.from(`chunk${i}`));
    mockSplit.mockResolvedValue(chunks);

    const callOrder: number[] = [];
    let callIdx = 0;
    const texts = ["A.", "B.", "C.", "D.", "E."];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const idx = callIdx++;
      callOrder.push(idx);
      // Simulate varying response times — later chunks resolve faster
      await new Promise((r) => setTimeout(r, (5 - idx) * 5));
      return new Response(JSON.stringify({ text: texts[idx] }), { status: 200 });
    });

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    const result = await transcribeAudioChunked(Buffer.from("large"), "recording.webm");

    // Order must be preserved regardless of response timing
    expect(result).toBe("A. B. C. D. E.");
    // All 5 chunks were transcribed
    expect(callOrder).toHaveLength(5);
  });

  it("passes logger through for progress tracking", async () => {
    const buf = Buffer.from("small-audio");
    mockSplit.mockResolvedValue([buf]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "test" }), { status: 200 }),
    );

    const log = { info: vi.fn() };

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    await transcribeAudioChunked(buf, "test.webm", log);

    expect(log.info).toHaveBeenCalled();
    // Should log chunking info and completion
    const messages = log.info.mock.calls.map((c: unknown[]) => c[1]);
    expect(messages).toContain("Starting audio chunking");
    expect(messages).toContain("Audio chunked");
    expect(messages).toContain("Transcription complete");
  });
});
