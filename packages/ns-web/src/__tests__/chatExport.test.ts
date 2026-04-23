import { describe, it, expect } from "vitest";
import { serializeChatToMarkdown, defaultChatTitle } from "../lib/chatExport.js";

describe("chatExport — serializeChatToMarkdown", () => {
  it("renders user + assistant turns with role headings and a title", () => {
    const md = serializeChatToMarkdown(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
      { title: "My Chat" },
    );
    expect(md).toContain("# My Chat");
    expect(md).toContain("## You");
    expect(md).toContain("hello");
    expect(md).toContain("## Assistant");
    expect(md).toContain("hi there");
  });

  it("converts [Title] citations to [[Title]] wiki-links in assistant turns only", () => {
    const md = serializeChatToMarkdown(
      [
        { role: "user", content: "tell me about [Foo]" }, // user input is not transformed
        { role: "assistant", content: "I read [Foo Bar] and [Baz]." },
      ],
      { title: "T" },
    );
    expect(md).toContain("tell me about [Foo]"); // unchanged
    expect(md).toContain("[[Foo Bar]]");
    expect(md).toContain("[[Baz]]");
  });

  it("skips empty-content turns (streaming placeholders)", () => {
    const md = serializeChatToMarkdown(
      [
        { role: "user", content: "q" },
        { role: "assistant", content: "   " },
        { role: "user", content: "q2" },
      ],
      { title: "T" },
    );
    expect((md.match(/## Assistant/g) ?? []).length).toBe(0);
  });

  it("flattens completed meeting-summary cards to a single line with a wiki-link", () => {
    const md = serializeChatToMarkdown(
      [
        {
          role: "meeting-summary",
          content: "",
          meetingData: { mode: "meeting", noteTitle: "Standup 4/23", status: "completed" },
        },
      ],
      { title: "T" },
    );
    expect(md).toContain("## Meeting");
    expect(md).toContain('A meeting recording ended — captured in [[Standup 4/23]].');
  });

  it("flattens failed meeting-summary cards", () => {
    const md = serializeChatToMarkdown(
      [
        {
          role: "meeting-summary",
          content: "",
          meetingData: { mode: "lecture", status: "failed" },
        },
      ],
      { title: "T" },
    );
    expect(md).toContain("A lecture recording ended; note generation failed.");
  });

  it("includes timestamp when provided", () => {
    const md = serializeChatToMarkdown(
      [{ role: "user", content: "x" }],
      { title: "T", timestamp: "2026-04-23 5:24 PM" },
    );
    expect(md).toContain("*Exported 2026-04-23 5:24 PM*");
  });

  it("ends with a single trailing newline", () => {
    const md = serializeChatToMarkdown(
      [{ role: "user", content: "x" }],
      { title: "T" },
    );
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
});

describe("chatExport — defaultChatTitle", () => {
  it("formats as 'Chat — Mon DD, YYYY at H:MM AM/PM'", () => {
    const title = defaultChatTitle(new Date("2026-04-23T17:24:00"));
    expect(title).toMatch(/^Chat — \w{3} \d{1,2}, 2026 at \d{1,2}:\d{2} (AM|PM)$/);
    expect(title).toContain("2026");
  });
});
