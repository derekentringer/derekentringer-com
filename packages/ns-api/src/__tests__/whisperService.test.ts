import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetConfig } from "../config.js";

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
