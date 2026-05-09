// Tests for the mobile chat-export markdown serializer (Phase A.5).

import {
  defaultChatTitle,
  serializeChatToMarkdown,
  type ExportMessage,
} from "../lib/chatExport";

describe("serializeChatToMarkdown", () => {
  it("emits an H1 with the provided title plus optional timestamp", () => {
    const md = serializeChatToMarkdown([], { title: "T", timestamp: "2026-04-28T12:00Z" });
    expect(md).toContain("# T");
    expect(md).toContain("Exported 2026-04-28T12:00Z");
  });

  it("renders user + assistant turns as ## You / ## Assistant sections", () => {
    const messages: ExportMessage[] = [
      { role: "user", content: "What is X?" },
      { role: "assistant", content: "X is a thing." },
    ];
    const md = serializeChatToMarkdown(messages, { title: "T" });
    expect(md).toContain("## You");
    expect(md).toContain("What is X?");
    expect(md).toContain("## Assistant");
    expect(md).toContain("X is a thing.");
  });

  it("converts inline [Title] citations to [[Title]] wiki-links", () => {
    const messages: ExportMessage[] = [
      { role: "user", content: "tell me about my notes" },
      {
        role: "assistant",
        content: "See [Note A] and also [Note B] for context.",
      },
    ];
    const md = serializeChatToMarkdown(messages, { title: "T" });
    expect(md).toContain("[[Note A]]");
    expect(md).toContain("[[Note B]]");
  });

  it("appends a Referenced notes list from noteCards", () => {
    const messages: ExportMessage[] = [
      {
        role: "assistant",
        content: "Here are some.",
        noteCards: [
          { id: "n1", title: "Alpha" },
          { id: "n2", title: "Beta" },
        ],
      },
    ];
    const md = serializeChatToMarkdown(messages, { title: "T" });
    expect(md).toContain("**Referenced notes:**");
    expect(md).toContain("- [[Alpha]]");
    expect(md).toContain("- [[Beta]]");
  });

  it("dedups noteCards + sources by title", () => {
    const messages: ExportMessage[] = [
      {
        role: "assistant",
        content: "Reply.",
        noteCards: [{ id: "n1", title: "Same" }],
        sources: [{ id: "n1", title: "Same" }],
      },
    ];
    const md = serializeChatToMarkdown(messages, { title: "T" });
    const matches = md.match(/\[\[Same\]\]/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("skips assistant turns with no content and no references", () => {
    const messages: ExportMessage[] = [
      { role: "user", content: "Q" },
      { role: "assistant", content: "" },
      { role: "user", content: "Q2" },
    ];
    const md = serializeChatToMarkdown(messages, { title: "T" });
    expect(md.match(/## Assistant/g)).toBeNull();
  });

  it("renders a meeting-summary section when meetingData is present", () => {
    const messages: ExportMessage[] = [
      {
        role: "meeting-summary",
        content: "",
        meetingData: {
          mode: "meeting",
          noteTitle: "Standup 04/28",
        },
      },
    ];
    const md = serializeChatToMarkdown(messages, { title: "T" });
    expect(md).toContain("## Meeting");
    expect(md).toContain("[[Standup 04/28]]");
  });
});

describe("defaultChatTitle", () => {
  it("renders 'Chat — <date> at <time>'", () => {
    const title = defaultChatTitle(new Date("2026-04-28T17:24:00Z"));
    expect(title).toMatch(/^Chat — /);
    // Locale formatting can vary in CI; just check the shape.
    expect(title).toMatch(/Chat — .+ at .+/);
  });
});
