// Tests for the mobile AI api client (Phase A.1).
//
// We mock the underlying axios `api` and `react-native-sse`
// EventSource so the tests don't hit real network. The tests cover
// the non-streaming wrappers (`confirmTool`, `fetchChatHistory`,
// `replaceChatMessages`, `clearServerChatHistory`) plus a basic
// askQuestion happy-path that walks the EventSource through one
// text event + done.

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockGetAccessToken = jest.fn().mockReturnValue("test-token");

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  tokenManager: {
    getAccessToken: () => mockGetAccessToken(),
  },
}));

// jest.mock factories are hoisted above imports, so the FakeEventSource
// class needs to live INSIDE the factory closure. Expose `lastInstance`
// via the mocked module so the test body can drive it.
// jest.mock factories are hoisted ABOVE imports — TS type aliases /
// parameter properties / annotations referenced inside trip the
// "out-of-scope" hoist guard. The factory body is therefore plain
// JS-style. The test body re-types the result via `getLastEventSource`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock("react-native-sse", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  class FakeEventSource {
    static lastInstance: any = null;
    url: string;
    init: unknown;
    listeners: Record<string, Array<(event: any) => void>> = {};
    closed = false;
    constructor(url: string, init: unknown) {
      this.url = url;
      this.init = init;
      FakeEventSource.lastInstance = this;
    }
    addEventListener(name: string, fn: (event: any) => void) {
      (this.listeners[name] = this.listeners[name] || []).push(fn);
    }
    emit(name: string, payload: { data?: string; message?: string } = {}) {
      for (const l of this.listeners[name] || []) l(payload);
    }
    close() {
      this.closed = true;
    }
  }
  return { __esModule: true, default: FakeEventSource };
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

// Helper to reach the EventSource instance the test drives.
function getLastEventSource(): {
  emit: (name: string, payload?: { data?: string; message?: string }) => void;
  closed: boolean;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("react-native-sse") as { default: { lastInstance: unknown } };
  return mod.default.lastInstance as {
    emit: (name: string, payload?: { data?: string; message?: string }) => void;
    closed: boolean;
  };
}

import {
  askQuestion,
  confirmTool,
  fetchChatHistory,
  replaceChatMessages,
  clearServerChatHistory,
  summarizeNote,
  suggestTags,
  transcribeChunk,
  transcribeAudio,
  structureTranscript,
} from "../api/ai";

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockDelete.mockReset();
  // Reset the SSE module state between tests.
// eslint-disable-next-line @typescript-eslint/no-var-requires
(require("react-native-sse") as { default: { lastInstance: unknown } }).default.lastInstance = null;
  mockGetAccessToken.mockReturnValue("test-token");
});

describe("ai api client (mobile)", () => {
  describe("confirmTool", () => {
    it("posts to /ai/tools/confirm and returns the result", async () => {
      mockPost.mockResolvedValue({
        data: { text: "Renamed.", noteCards: [{ id: "n1", title: "X" }] },
      });
      const result = await confirmTool("rename_note", { oldTitle: "A", newTitle: "B" });
      expect(mockPost).toHaveBeenCalledWith("/ai/tools/confirm", {
        toolName: "rename_note",
        toolInput: { oldTitle: "A", newTitle: "B" },
      });
      expect(result.text).toBe("Renamed.");
      expect(result.noteCards).toHaveLength(1);
    });
  });

  describe("fetchChatHistory", () => {
    it("returns the messages array from the server", async () => {
      mockGet.mockResolvedValue({
        data: { messages: [{ role: "user", content: "hi" }] },
      });
      const messages = await fetchChatHistory();
      expect(mockGet).toHaveBeenCalledWith("/ai/chat-history");
      expect(messages).toEqual([{ role: "user", content: "hi" }]);
    });

    it("returns an empty array when the server returns no messages", async () => {
      mockGet.mockResolvedValue({ data: {} });
      const messages = await fetchChatHistory();
      expect(messages).toEqual([]);
    });
  });

  describe("replaceChatMessages", () => {
    it("PUTs the messages payload", async () => {
      mockPut.mockResolvedValue({ data: {} });
      await replaceChatMessages([{ role: "user", content: "hi" }]);
      expect(mockPut).toHaveBeenCalledWith("/ai/chat-history", {
        messages: [{ role: "user", content: "hi" }],
      });
    });
  });

  describe("clearServerChatHistory", () => {
    it("DELETEs /ai/chat-history", async () => {
      mockDelete.mockResolvedValue({ data: {} });
      await clearServerChatHistory();
      expect(mockDelete).toHaveBeenCalledWith("/ai/chat-history");
    });
  });

  describe("summarizeNote", () => {
    it("POSTs the noteId and returns the summary string", async () => {
      mockPost.mockResolvedValue({ data: { summary: "Short summary." } });
      const result = await summarizeNote("note-1");
      expect(mockPost).toHaveBeenCalledWith("/ai/summarize", {
        noteId: "note-1",
      });
      expect(result).toBe("Short summary.");
    });
  });

  describe("suggestTags", () => {
    it("POSTs the noteId and returns the tag list", async () => {
      mockPost.mockResolvedValue({
        data: { tags: ["meeting", "planning"] },
      });
      const result = await suggestTags("note-1");
      expect(mockPost).toHaveBeenCalledWith("/ai/tags", {
        noteId: "note-1",
      });
      expect(result).toEqual(["meeting", "planning"]);
    });

    it("returns an empty array when the server returns no tags", async () => {
      mockPost.mockResolvedValue({ data: {} });
      const result = await suggestTags("note-1");
      expect(result).toEqual([]);
    });
  });

  describe("transcribeChunk", () => {
    it("POSTs multipart with sessionId/chunkIndex and returns the chunk text", async () => {
      mockPost.mockResolvedValue({
        data: { sessionId: "sess-1", chunkIndex: 2, text: "hello world" },
      });
      const result = await transcribeChunk(
        "file:///tmp/chunk.wav",
        "audio/wav",
        "wav",
        "sess-1",
        2,
      );
      expect(mockPost).toHaveBeenCalledTimes(1);
      const [path, body, opts] = mockPost.mock.calls[0];
      expect(path).toBe("/ai/transcribe-chunk");
      expect(body).toBeInstanceOf(FormData);
      expect((opts as { headers: Record<string, string> }).headers["Content-Type"]).toBe(
        "multipart/form-data",
      );
      expect(result).toEqual({
        sessionId: "sess-1",
        chunkIndex: 2,
        text: "hello world",
      });
    });
  });

  describe("transcribeAudio", () => {
    it("POSTs multipart with mode + optional folderId", async () => {
      mockPost.mockResolvedValue({
        data: { title: "T", content: "C", tags: ["a"] },
      });
      const result = await transcribeAudio(
        "file:///tmp/rec.m4a",
        "audio/m4a",
        "m4a",
        "memo",
        "f1",
      );
      expect(mockPost).toHaveBeenCalledWith(
        "/ai/transcribe",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
        }),
      );
      expect(result.title).toBe("T");
      expect(result.tags).toEqual(["a"]);
    });
  });

  describe("structureTranscript", () => {
    it("POSTs JSON transcript + mode + optional folderId", async () => {
      mockPost.mockResolvedValue({
        data: { title: "T", content: "C", tags: [] },
      });
      const result = await structureTranscript(
        "Some transcript text",
        "lecture",
        "f1",
      );
      expect(mockPost).toHaveBeenCalledWith("/ai/structure-transcript", {
        transcript: "Some transcript text",
        mode: "lecture",
        folderId: "f1",
      });
      expect(result.title).toBe("T");
    });

    it("omits folderId when not supplied", async () => {
      mockPost.mockResolvedValue({
        data: { title: "T", content: "C", tags: [] },
      });
      await structureTranscript("hi", "memo");
      expect(mockPost).toHaveBeenCalledWith("/ai/structure-transcript", {
        transcript: "hi",
        mode: "memo",
      });
    });
  });

  describe("askQuestion", () => {
    it("yields parsed events from the SSE stream", async () => {
      const controller = new AbortController();
      const gen = askQuestion("test", controller.signal);
      // Pump the generator one tick so it constructs the EventSource.
      const first = gen.next();

      // Wait for the FakeEventSource to be created.
      await Promise.resolve();
      const es = getLastEventSource();
      expect(es).toBeTruthy();
      es.emit("message", { data: JSON.stringify({ text: "Hello" }) });
      es.emit("message", { data: JSON.stringify({ text: ", world" }) });
      es.emit("message", { data: "[DONE]" });

      const r1 = await first;
      const r2 = await gen.next();
      const r3 = await gen.next();

      expect(r1.done).toBe(false);
      expect(r1.value).toEqual({ text: "Hello" });
      expect(r2.value).toEqual({ text: ", world" });
      expect(r3.done).toBe(true);
      expect(es.closed).toBe(true);
    });

    it("throws when the server emits an error event", async () => {
      const controller = new AbortController();
      const gen = askQuestion("test", controller.signal);
      // Capture the first pending pull so we can await it explicitly
      // — the error envelope resolves THIS promise, and an unawaited
      // rejection would crash the test runner.
      const firstPull = gen.next();
      await Promise.resolve();
      getLastEventSource().emit("error", { message: "boom" });
      await expect(firstPull).rejects.toThrow("boom");
    });

    it("closes the EventSource when the AbortSignal aborts", async () => {
      const controller = new AbortController();
      const gen = askQuestion("test", controller.signal);
      const firstPull = gen.next();
      await Promise.resolve();
      const es = getLastEventSource();
      controller.abort();
      // Abort pushes a `done` envelope; the awaiting pull resolves.
      const result = await firstPull;
      expect(result.done).toBe(true);
      expect(es.closed).toBe(true);
    });

    it("throws when no access token is available", async () => {
      mockGetAccessToken.mockReturnValueOnce(null);
      const controller = new AbortController();
      const gen = askQuestion("test", controller.signal);
      await expect(gen.next()).rejects.toThrow("Not authenticated");
    });
  });
});
