import { describe, it, expect } from "vitest";
import { assembleTranscript } from "../transcriptAssembly.ts";

describe("assembleTranscript", () => {
  it("returns empty string for an empty map", () => {
    expect(assembleTranscript(new Map())).toBe("");
  });

  it("orders chunks by numeric index", () => {
    // Insert out-of-order to prove the sort happens inside assemble.
    const m = new Map<number, string>();
    m.set(2, "three");
    m.set(0, "one");
    m.set(1, "two");
    expect(assembleTranscript(m)).toBe("one two three");
  });

  it("skips missing indices without 'undefined' leaking in", () => {
    // Chunks 0, 1, 3 arrived; chunk 2 failed Whisper and is absent.
    // Previously a `0..maxIdx` loop produced "one two undefined four";
    // the new sort-entries approach just strings together what exists.
    const m = new Map<number, string>();
    m.set(0, "one");
    m.set(1, "two");
    m.set(3, "four");
    expect(assembleTranscript(m)).toBe("one two four");
  });

  it("handles a large gap without blowing the stack", () => {
    // `Math.max(...keys)` with a spread over thousands of entries
    // historically risked a Maximum Call Stack exceeded. The
    // entries-sort approach has no such limit.
    const m = new Map<number, string>();
    for (let i = 0; i < 5000; i++) m.set(i, `c${i}`);
    const result = assembleTranscript(m);
    expect(result.startsWith("c0 c1 c2")).toBe(true);
    expect(result.endsWith("c4998 c4999")).toBe(true);
  });

  it("last-write-wins on duplicate index (set() overwrites)", () => {
    // Caller (AudioRecorder) relies on `Map.set()` to overwrite on
    // duplicate (sessionId, chunkIndex). We exercise it through the
    // assemble path to document the expected behavior end-to-end.
    const m = new Map<number, string>();
    m.set(0, "first attempt");
    m.set(0, "retry — wins");
    m.set(1, "chunk one");
    expect(assembleTranscript(m)).toBe("retry — wins chunk one");
  });

  it("preserves a single-chunk transcript", () => {
    const m = new Map<number, string>();
    m.set(7, "lone chunk");
    expect(assembleTranscript(m)).toBe("lone chunk");
  });

  it("joins chunks with a single space (no trailing space)", () => {
    const m = new Map<number, string>();
    m.set(0, "a");
    m.set(1, "b");
    const out = assembleTranscript(m);
    expect(out).toBe("a b");
    expect(out.endsWith(" ")).toBe(false);
  });
});
