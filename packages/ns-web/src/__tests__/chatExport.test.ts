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
    expect(md).not.toContain("##  Assistant\n\n   ");
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

  // Regression: `/saveChat` previously only scanned prose for
  // `[Title]` brackets and lost the clickable note pills the chat
  // UI shows (attached as noteCards / sources on assistant turns).
  // The saved note came out devoid of the references the user was
  // looking at.
  it("serializes assistant noteCards as a Referenced notes list of wiki-links", () => {
    const md = serializeChatToMarkdown(
      [
        { role: "user", content: "find meeting notes" },
        {
          role: "assistant",
          content: "Here are a few recent meetings:",
          noteCards: [
            { id: "n1", title: "Daily Stand-up Meeting" },
            { id: "n2", title: "Brief Meeting Conclusion" },
          ],
        },
      ],
      { title: "T" },
    );
    expect(md).toContain("**Referenced notes:**");
    expect(md).toContain("- [[Daily Stand-up Meeting]]");
    expect(md).toContain("- [[Brief Meeting Conclusion]]");
  });

  it("serializes Q&A sources as wiki-links", () => {
    const md = serializeChatToMarkdown(
      [
        { role: "user", content: "what notes about X" },
        {
          role: "assistant",
          content: "Based on your notes, X is …",
          sources: [
            { id: "n1", title: "X Reference Note" },
            { id: "n2", title: "Related X Follow-up" },
          ],
        },
      ],
      { title: "T" },
    );
    expect(md).toContain("- [[X Reference Note]]");
    expect(md).toContain("- [[Related X Follow-up]]");
  });

  it("dedupes when the same title appears in both noteCards and sources", () => {
    const md = serializeChatToMarkdown(
      [
        {
          role: "assistant",
          content: "about [[Foo]]",
          noteCards: [{ id: "n1", title: "Foo Note" }],
          sources: [{ id: "n1", title: "Foo Note" }],
        },
      ],
      { title: "T" },
    );
    const matches = md.match(/- \[\[Foo Note\]\]/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("keeps an assistant turn with only noteCards (no prose content)", () => {
    const md = serializeChatToMarkdown(
      [
        // A /recent command returns a turn with a short label and
        // the real value is in noteCards — used to be skipped.
        { role: "assistant", content: "", noteCards: [{ id: "n1", title: "Weekly Notes" }] },
      ],
      { title: "T" },
    );
    expect(md).toContain("## Assistant");
    expect(md).toContain("- [[Weekly Notes]]");
  });
});

describe("chatExport — defaultChatTitle", () => {
  it("formats as 'Chat — Mon DD, YYYY at H:MM AM/PM'", () => {
    const title = defaultChatTitle(new Date("2026-04-23T17:24:00"));
    expect(title).toMatch(/^Chat — \w{3} \d{1,2}, 2026 at \d{1,2}:\d{2} (AM|PM)$/);
    expect(title).toContain("2026");
  });
});
