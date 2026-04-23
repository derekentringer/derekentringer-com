import { describe, it, expect } from "vitest";
import {
  serializeChatHistory,
  trimHistoryToBudget,
  buildHistoryForClaude,
} from "../lib/chatHistory.js";

describe("chatHistory — serializeChatHistory", () => {
  it("preserves user and assistant turns with content", () => {
    const result = serializeChatHistory([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "question?" },
    ]);
    expect(result).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "question?" },
    ]);
  });

  it("drops empty-content messages (transient streaming placeholders)", () => {
    const result = serializeChatHistory([
      { role: "user", content: "q" },
      { role: "assistant", content: "" }, // in-flight placeholder
      { role: "assistant", content: "   " }, // whitespace only
      { role: "user", content: "q2" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("q");
    expect(result[1].content).toBe("q2");
  });

  it("converts meeting-summary (completed) to a short assistant note with the title", () => {
    const result = serializeChatHistory([
      { role: "user", content: "record meeting" },
      {
        role: "meeting-summary",
        content: "",
        meetingData: { mode: "meeting", noteTitle: "Standup 2026-04-23", status: "completed" },
      },
      { role: "user", content: "summarize it" },
    ]);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({
      role: "assistant",
      content: '[A meeting recording ended — I created the note "Standup 2026-04-23".]',
    });
  });

  it("converts meeting-summary (failed) distinctly", () => {
    const result = serializeChatHistory([
      {
        role: "meeting-summary",
        content: "",
        meetingData: { mode: "memo", status: "failed" },
      },
    ]);
    expect(result[0].content).toContain("failed");
  });

  it("converts meeting-summary (in-progress) distinctly", () => {
    const result = serializeChatHistory([
      {
        role: "meeting-summary",
        content: "",
        meetingData: { mode: "lecture", status: "processing" },
      },
    ]);
    expect(result[0].content).toContain("in progress");
  });

  it("skips unknown roles", () => {
    const result = serializeChatHistory([
      { role: "user", content: "q" },
      { role: "system", content: "noise" } as never,
      { role: "assistant", content: "a" },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.role)).toEqual(["user", "assistant"]);
  });
});

describe("chatHistory — trimHistoryToBudget", () => {
  it("returns input unchanged when under budget", () => {
    const h = [
      { role: "user" as const, content: "short" },
      { role: "assistant" as const, content: "also short" },
    ];
    expect(trimHistoryToBudget(h, 100)).toBe(h);
  });

  it("drops oldest turns until under budget", () => {
    const h = [
      { role: "user" as const, content: "A".repeat(50) },      // oldest
      { role: "assistant" as const, content: "B".repeat(50) },
      { role: "user" as const, content: "C".repeat(50) },
      { role: "assistant" as const, content: "D".repeat(50) }, // newest
    ];
    // Budget 120 — must drop the first two (total 100) to fit the last
    // two (total 100). Dropping only one leaves 150 > 120.
    const trimmed = trimHistoryToBudget(h, 120);
    expect(trimmed).toHaveLength(2);
    expect(trimmed[0].content).toBe("C".repeat(50));
    expect(trimmed[1].content).toBe("D".repeat(50));
  });

  it("drops down to one turn if the newest still fits", () => {
    const h = [
      { role: "user" as const, content: "X".repeat(50) },
      { role: "assistant" as const, content: "Y".repeat(200) },
    ];
    // Total 250 > budget 200 → drop oldest (50) → remaining 200 fits.
    const trimmed = trimHistoryToBudget(h, 200);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0].content).toBe("Y".repeat(200));
  });

  it("returns empty when even the newest turn exceeds budget", () => {
    const h = [
      { role: "user" as const, content: "Z".repeat(500) },
    ];
    expect(trimHistoryToBudget(h, 100)).toEqual([]);
  });
});

describe("chatHistory — buildHistoryForClaude", () => {
  it("applies turn limit before char budget", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const result = buildHistoryForClaude(many, { maxTurns: 10, maxChars: 1_000_000 });
    expect(result).toHaveLength(10);
    // Most recent are preserved
    expect(result[result.length - 1].content).toBe("turn 59");
    expect(result[0].content).toBe("turn 50");
  });

  it("returns empty for empty input", () => {
    expect(buildHistoryForClaude([])).toEqual([]);
  });
});
