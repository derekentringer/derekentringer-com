// Tests for the mobile chat-history serializer (Phase A.5).
// Covers the same shape as the desktop/web variants.

import {
  serializeChatHistory,
  trimChatHistory,
  type ChatHistoryTurn,
} from "../lib/chatHistory";

describe("serializeChatHistory", () => {
  it("converts user + assistant text turns to {role, content} pairs", () => {
    const out = serializeChatHistory([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second" },
    ]);
  });

  it("skips empty-content turns (transient streaming placeholders)", () => {
    const out = serializeChatHistory([
      { role: "user", content: "real" },
      { role: "assistant", content: "" },
      { role: "assistant", content: "   " },
      { role: "assistant", content: "real reply" },
    ]);
    expect(out.map((t) => t.content)).toEqual(["real", "real reply"]);
  });

  it("summarizes meeting-summary cards as one line of assistant prose", () => {
    const out = serializeChatHistory([
      {
        role: "meeting-summary",
        content: "",
        meetingData: { mode: "meeting", noteTitle: "Sprint Planning" },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("assistant");
    expect(out[0].content).toContain("Sprint Planning");
    expect(out[0].content).toContain("meeting recording");
  });

  it("handles failed meeting summaries", () => {
    const out = serializeChatHistory([
      {
        role: "meeting-summary",
        content: "",
        meetingData: { mode: "memo", status: "failed" },
      },
    ]);
    expect(out[0].content).toContain("failed");
  });

  it("handles in-progress meeting summaries", () => {
    const out = serializeChatHistory([
      {
        role: "meeting-summary",
        content: "",
        meetingData: { mode: "lecture" },
      },
    ]);
    expect(out[0].content).toContain("in progress");
  });

  it("ignores roles outside user/assistant/meeting-summary", () => {
    const out = serializeChatHistory([
      { role: "user", content: "hi" },
      { role: "system", content: "ignored" },
      { role: "tool", content: "ignored" },
    ]);
    expect(out).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("trimChatHistory", () => {
  function turn(content: string): ChatHistoryTurn {
    return { role: "user", content };
  }

  it("returns the input unchanged when total fits within the cap", () => {
    const h = [turn("a".repeat(100)), turn("b".repeat(200))];
    expect(trimChatHistory(h, 1000)).toEqual(h);
  });

  it("drops oldest turns until the total is under the cap", () => {
    const h = [
      turn("a".repeat(50)),
      turn("b".repeat(50)),
      turn("c".repeat(50)),
    ];
    // Cap = 100 → first turn (50) + second (100 total) just fits;
    // adding the third would overflow, so we drop the oldest.
    const out = trimChatHistory(h, 100);
    // The implementation drops oldest until <= cap; with three 50s
    // and cap 100, dropping one leaves 100 which fits.
    expect(out.length).toBe(2);
    expect(out[0].content).toBe("b".repeat(50));
    expect(out[1].content).toBe("c".repeat(50));
  });

  it("uses the 20k default when no cap is provided", () => {
    const small = [turn("a".repeat(100))];
    expect(trimChatHistory(small)).toEqual(small);
  });
});
