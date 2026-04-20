import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetConfig } from "../config.js";
import { installWhisperMock, type WhisperMock } from "./helpers/whisperMock.js";

vi.mock("../services/audioChunker.js", () => ({
  splitAudioIfNeeded: vi.fn(),
}));

import { splitAudioIfNeeded } from "../services/audioChunker.js";

const mockSplit = vi.mocked(splitAudioIfNeeded);

let whisper: WhisperMock;

beforeEach(() => {
  resetConfig();
  process.env.NODE_ENV = "test";
  process.env.OPENAI_API_KEY = "sk-test-key";
  whisper = installWhisperMock();
});

afterEach(() => {
  whisper.uninstall();
  vi.restoreAllMocks();
  resetConfig();
});

describe("whisperService", () => {
  it("calls Whisper API with correct URL, auth, model, and filename", async () => {
    whisper.succeed("Hello world");

    const { transcribeAudio } = await import("../services/whisperService.js");
    const result = await transcribeAudio(Buffer.from("audio-data"), "test.webm");

    expect(result).toBe("Hello world");
    whisper.assertAttempts(1);
    expect(whisper.attempts[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(whisper.attempts[0].method).toBe("POST");
    expect(whisper.attempts[0].model).toBe("whisper-1");
    expect(whisper.attempts[0].filename).toBe("test.webm");
  });

  it("returns transcript text", async () => {
    whisper.succeed("Transcribed audio content");

    const { transcribeAudio } = await import("../services/whisperService.js");
    const result = await transcribeAudio(Buffer.from("data"), "recording.webm");

    expect(result).toBe("Transcribed audio content");
  });

  it("throws on API error", async () => {
    whisper.fail(401, "Unauthorized");

    const { transcribeAudio } = await import("../services/whisperService.js");

    await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
      "Whisper API error (401): Unauthorized",
    );
  });

  it("retries on 502 and succeeds on second attempt", async () => {
    whisper.fail(502, "Bad Gateway").succeed("Retry worked");

    const { transcribeAudio } = await import("../services/whisperService.js");
    const result = await transcribeAudio(Buffer.from("data"), "test.webm");

    expect(result).toBe("Retry worked");
    whisper.assertRetrySequence([502, 200]);
  });

  it("retries on 503 and 504", async () => {
    whisper.fail(503, "Service Unavailable").fail(504, "Gateway Timeout").succeed("OK");

    const { transcribeAudio } = await import("../services/whisperService.js");
    const result = await transcribeAudio(Buffer.from("data"), "test.webm");

    expect(result).toBe("OK");
    whisper.assertRetrySequence([503, 504, 200]);
  });

  it("throws after exhausting retries on 502", async () => {
    // MAX_RETRIES = 2 → 3 total attempts.
    whisper.fail(502, "Bad Gateway").fail(502, "Bad Gateway").fail(502, "Bad Gateway");

    const { transcribeAudio } = await import("../services/whisperService.js");

    await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
      "Whisper API error (502): Bad Gateway",
    );
    whisper.assertRetrySequence([502, 502, 502]);
  });

  it("does not retry on non-retryable errors like 401", async () => {
    whisper.fail(401, "Unauthorized");

    const { transcribeAudio } = await import("../services/whisperService.js");

    await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow();
    whisper.assertAttempts(1);
  });

  // Phase 0.1 — new coverage of error surfaces the inline fetch mocks couldn't hit.
  describe("error-path coverage (Phase 0.1 additions)", () => {
    it("retries on 429 (rate limit) up to MAX_RETRIES, then gives up", async () => {
      // Phase 3.3: 429 is now in RETRYABLE_STATUSES — OpenAI pushes
      // back on burst traffic often enough that a 1s-backoff retry
      // loop is the right call. This test exercises the "three
      // attempts total (1 initial + 2 retries), all 429" path.
      whisper.fail(429, "Rate limit exceeded");
      whisper.fail(429, "Rate limit exceeded");
      whisper.fail(429, "Rate limit exceeded");

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        "Whisper API error (429): Rate limit exceeded",
      );
      whisper.assertRetrySequence([429, 429, 429]);
    });

    it("succeeds after a single 429 retry", async () => {
      // Happy-path for the new 429 retry: first attempt rate-limited,
      // second attempt succeeds, caller never sees the 429.
      whisper.fail(429, "Rate limit exceeded");
      whisper.succeed("recovered after rate limit");

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).resolves.toBe(
        "recovered after rate limit",
      );
      whisper.assertRetrySequence([429, 200]);
    });

    it("surfaces a timeout error without retrying", async () => {
      // AbortSignal.timeout → `AbortError`. The service currently lets
      // it propagate directly; the retry loop only handles HTTP
      // statuses. Documenting this behavior so Phase 3 can decide
      // whether to treat timeouts as retryable.
      whisper.timeout();

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        /timeout/i,
      );
      whisper.assertAttempts(1);
    });

    it("surfaces a generic network error without retrying", async () => {
      whisper.networkError("socket hang up");

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        "socket hang up",
      );
      whisper.assertAttempts(1);
    });

    it("throws on malformed 200 response (Whisper sent HTML)", async () => {
      whisper.malformed();

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow();
      whisper.assertAttempts(1);
    });

    it("retries through a mixed failure sequence (timeout → 502 → 200)", async () => {
      // Whisper service today only retries HTTP 502/503/504. A timeout
      // on the first attempt breaks out of the loop — this test
      // documents that. Phase 3.3 will revisit.
      whisper.timeout().succeed("after timeout");

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        /timeout/i,
      );
      whisper.assertRetrySequence(["timeout"]);
    });

    it("retries 502 twice before finally succeeding (max retries + 1 = 3)", async () => {
      whisper.fail(502).fail(502).succeed("third time");

      const { transcribeAudio } = await import("../services/whisperService.js");
      const result = await transcribeAudio(Buffer.from("data"), "test.webm");

      expect(result).toBe("third time");
      whisper.assertRetrySequence([502, 502, 200]);
    });

    // Phase 5.4 — auth + quota body variations. The service propagates
    // the response body verbatim in the error message so the caller
    // (the /ai/transcribe route → the UI toast) can show the user
    // what actually went wrong.
    it("surfaces 401 body on auth failure (e.g. invalid API key)", async () => {
      whisper.fail(
        401,
        '{"error":{"message":"Invalid API key","type":"invalid_request_error"}}',
      );

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        /Invalid API key/,
      );
      whisper.assertAttempts(1);
    });

    it("surfaces 429 quota-exceeded body even after retries exhausted", async () => {
      // Quota-level 429s look different from rate-limit 429s on the
      // wire: OpenAI surfaces them with a body like "You exceeded your
      // current quota". The retry loop treats them identically (both
      // bucket into 429 → retryable), but the final error message
      // must still include the quota context so the user knows it's
      // not a transient issue.
      const body = '{"error":{"message":"You exceeded your current quota"}}';
      whisper.fail(429, body).fail(429, body).fail(429, body);

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        /exceeded your current quota/,
      );
      whisper.assertRetrySequence([429, 429, 429]);
    });

    it("does not retry 400 (bad request — e.g. malformed audio)", async () => {
      whisper.fail(400, "Invalid audio format");

      const { transcribeAudio } = await import("../services/whisperService.js");

      await expect(transcribeAudio(Buffer.from("data"), "test.webm")).rejects.toThrow(
        /Invalid audio format/,
      );
      whisper.assertAttempts(1);
    });
  });
});

describe("transcribeAudioChunked", () => {
  it("transcribes single chunk when audio is small", async () => {
    const buf = Buffer.from("small-audio");
    mockSplit.mockResolvedValue([buf]);

    whisper.succeed("Hello world");

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    const result = await transcribeAudioChunked(buf, "test.webm");

    expect(result).toBe("Hello world");
    expect(mockSplit).toHaveBeenCalledWith(buf, "test.webm");
  });

  it("concatenates transcripts from multiple chunks with space", async () => {
    const chunks = [Buffer.from("chunk1"), Buffer.from("chunk2"), Buffer.from("chunk3")];
    mockSplit.mockResolvedValue(chunks);

    whisper.succeed("First part.").succeed("Second part.").succeed("Third part.");

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    const result = await transcribeAudioChunked(Buffer.from("large"), "recording.webm");

    expect(result).toBe("First part. Second part. Third part.");
  });

  it("transcribes chunks in parallel and preserves order", async () => {
    const chunks = Array.from({ length: 5 }, (_, i) => Buffer.from(`chunk${i}`));
    mockSplit.mockResolvedValue(chunks);

    // Queue 5 successful responses. Order is preserved by the service's
    // transcripts[] array, not by response arrival order.
    whisper.succeed("A.").succeed("B.").succeed("C.").succeed("D.").succeed("E.");

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    const result = await transcribeAudioChunked(Buffer.from("large"), "recording.webm");

    expect(result).toBe("A. B. C. D. E.");
    whisper.assertAttempts(5);
  });

  it("passes logger through for progress tracking", async () => {
    const buf = Buffer.from("small-audio");
    mockSplit.mockResolvedValue([buf]);

    whisper.succeed("test");

    const log = { info: vi.fn() };

    const { transcribeAudioChunked } = await import("../services/whisperService.js");
    await transcribeAudioChunked(buf, "test.webm", log);

    expect(log.info).toHaveBeenCalled();
    const messages = log.info.mock.calls.map((c: unknown[]) => c[1]);
    expect(messages).toContain("Starting audio chunking");
    expect(messages).toContain("Audio chunked");
    expect(messages).toContain("Transcription complete");
  });
});
