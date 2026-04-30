import {
  buildChunkEntry,
  buildErrorChunk,
  chunkMimeForPlatform,
} from "../lib/audioChunks";

describe("chunkMimeForPlatform", () => {
  it("returns wav/audio-wav for iOS", () => {
    expect(chunkMimeForPlatform("ios")).toEqual({
      mime: "audio/wav",
      extension: "wav",
    });
  });

  it("returns wav/audio-wav for macOS (parity with iOS pcm)", () => {
    expect(chunkMimeForPlatform("macos")).toEqual({
      mime: "audio/wav",
      extension: "wav",
    });
  });

  it("returns m4a/audio-m4a for Android", () => {
    expect(chunkMimeForPlatform("android")).toEqual({
      mime: "audio/m4a",
      extension: "m4a",
    });
  });

  it("falls back to m4a for unknown platforms", () => {
    expect(chunkMimeForPlatform("web")).toEqual({
      mime: "audio/m4a",
      extension: "m4a",
    });
  });
});

describe("buildChunkEntry", () => {
  it("returns an ok entry for non-empty text", () => {
    expect(buildChunkEntry("Hello world", 3)).toEqual({
      index: 3,
      text: "Hello world",
      status: "ok",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(buildChunkEntry("  hi  ", 0)).toEqual({
      index: 0,
      text: "hi",
      status: "ok",
    });
  });

  it("returns null for empty text (so silent chunks don't pollute the list)", () => {
    expect(buildChunkEntry("", 1)).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    expect(buildChunkEntry("   \n\t  ", 2)).toBeNull();
  });
});

describe("buildErrorChunk", () => {
  it("returns a sentinel error entry tagged with the chunk index", () => {
    expect(buildErrorChunk(7)).toEqual({
      index: 7,
      text: "[transcription failed]",
      status: "error",
    });
  });
});
