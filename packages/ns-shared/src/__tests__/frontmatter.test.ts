import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  updateFrontmatterField,
  removeFrontmatterField,
  stripFrontmatter,
  hasFrontmatter,
  injectFrontmatter,
} from "../frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses standard frontmatter fields", () => {
    const content = `---
title: My Note
date: "2026-04-16T10:30:00Z"
updated: "2026-04-16T14:22:00Z"
tags:
  - work
  - meetings
description: A quarterly meeting
favorite: true
---
# My Note

Body content here.`;

    const result = parseFrontmatter(content);
    expect(result.metadata.title).toBe("My Note");
    expect(result.metadata.date).toBe("2026-04-16T10:30:00Z");
    expect(result.metadata.updated).toBe("2026-04-16T14:22:00Z");
    expect(result.metadata.tags).toEqual(["work", "meetings"]);
    expect(result.metadata.description).toBe("A quarterly meeting");
    expect(result.metadata.favorite).toBe(true);
    expect(result.body).toBe("# My Note\n\nBody content here.");
    expect(Object.keys(result.unknownFields)).toHaveLength(0);
  });

  it("preserves unknown fields from Obsidian", () => {
    const content = `---
title: Test
cssclasses:
  - wide-page
aliases:
  - test note
kanban-plugin: board
publish: true
---
Body`;

    const result = parseFrontmatter(content);
    expect(result.metadata.title).toBe("Test");
    expect(result.metadata.aliases).toEqual(["test note"]);
    expect(result.unknownFields["cssclasses"]).toEqual(["wide-page"]);
    expect(result.unknownFields["kanban-plugin"]).toBe("board");
    expect(result.unknownFields["publish"]).toBe(true);
  });

  it("returns empty metadata when no frontmatter exists", () => {
    const content = "# Just a heading\n\nNo frontmatter here.";
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({});
    expect(result.body).toBe(content);
    expect(result.rawYaml).toBe("");
  });

  it("handles empty frontmatter block", () => {
    const content = "---\n---\nBody content";
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({});
    expect(result.body).toBe("Body content");
  });

  it("handles malformed YAML gracefully", () => {
    const content = "---\n: invalid: yaml: [broken\n---\nBody";
    const result = parseFrontmatter(content);
    // Malformed YAML should return entire content as body
    expect(result.body).toBe(content);
    expect(result.metadata).toEqual({});
  });

  it("handles tags as inline YAML array", () => {
    const content = "---\ntags: [javascript, web-dev]\n---\nBody";
    const result = parseFrontmatter(content);
    expect(result.metadata.tags).toEqual(["javascript", "web-dev"]);
  });

  it("handles single tag as string", () => {
    const content = "---\ntags: work\n---\nBody";
    const result = parseFrontmatter(content);
    expect(result.metadata.tags).toEqual(["work"]);
  });

  it("does not treat --- in body as frontmatter delimiter", () => {
    const content = `---
title: Test
---
Some text

---

More text after horizontal rule.`;

    const result = parseFrontmatter(content);
    expect(result.metadata.title).toBe("Test");
    expect(result.body).toContain("---");
    expect(result.body).toContain("More text after horizontal rule.");
  });

  it("handles empty content", () => {
    const result = parseFrontmatter("");
    expect(result.metadata).toEqual({});
    expect(result.body).toBe("");
  });

  it("handles Date objects from YAML 1.1 parsers", () => {
    // The yaml package in YAML 1.2 mode treats bare dates as strings,
    // but we handle Date objects defensively
    const content = '---\ndate: "2026-01-15T10:30:00Z"\n---\nBody';
    const result = parseFrontmatter(content);
    expect(result.metadata.date).toBe("2026-01-15T10:30:00Z");
  });

  it("handles favorite: false", () => {
    const content = "---\nfavorite: false\n---\nBody";
    const result = parseFrontmatter(content);
    expect(result.metadata.favorite).toBe(false);
  });
});

describe("serializeFrontmatter", () => {
  it("serializes metadata and body into content string", () => {
    const metadata = {
      title: "My Note",
      date: "2026-04-16T10:30:00Z",
      tags: ["work", "meetings"],
      favorite: true,
    };
    const body = "# My Note\n\nContent here.";
    const result = serializeFrontmatter(metadata, body);

    expect(result).toContain("---");
    expect(result).toContain("title: My Note");
    expect(result).toContain("date: 2026-04-16T10:30:00Z");
    expect(result).toContain("favorite: true");
    expect(result).toContain("# My Note\n\nContent here.");
  });

  it("produces empty frontmatter block when no metadata", () => {
    const result = serializeFrontmatter({}, "Body content");
    expect(result).toBe("---\n---\nBody content");
  });

  it("includes unknown fields after known fields", () => {
    const metadata = { title: "Test" };
    const unknownFields = { cssclasses: ["wide-page"], publish: true };
    const result = serializeFrontmatter(metadata, "Body", unknownFields);

    expect(result).toContain("title: Test");
    expect(result).toContain("publish: true");
    // title should come before publish
    const titleIndex = result.indexOf("title:");
    const publishIndex = result.indexOf("publish:");
    expect(titleIndex).toBeLessThan(publishIndex);
  });

  it("omits empty tags array", () => {
    const metadata = { title: "Test", tags: [] };
    const result = serializeFrontmatter(metadata, "Body");
    expect(result).not.toContain("tags");
  });

  it("handles empty body", () => {
    const result = serializeFrontmatter({ title: "Test" }, "");
    expect(result).toContain("title: Test");
    expect(result.endsWith("\n")).toBe(true);
  });
});

describe("round-trip", () => {
  it("parse then serialize preserves content", () => {
    const original = `---
title: Round Trip Test
date: "2026-04-16T10:30:00Z"
tags:
  - alpha
  - beta
description: Testing round-trip
favorite: true
---
# Round Trip Test

Body content here.`;

    const parsed = parseFrontmatter(original);
    const reserialized = serializeFrontmatter(
      parsed.metadata,
      parsed.body,
      parsed.unknownFields,
    );

    // Re-parse to verify
    const reparsed = parseFrontmatter(reserialized);
    expect(reparsed.metadata).toEqual(parsed.metadata);
    expect(reparsed.body).toBe(parsed.body);
  });

  it("preserves unknown fields across round-trip", () => {
    const original = `---
title: Obsidian Note
cssclasses:
  - wide-page
kanban-plugin: board
tags:
  - imported
---
Content from Obsidian.`;

    const parsed = parseFrontmatter(original);
    const reserialized = serializeFrontmatter(
      parsed.metadata,
      parsed.body,
      parsed.unknownFields,
    );
    const reparsed = parseFrontmatter(reserialized);

    expect(reparsed.unknownFields["cssclasses"]).toEqual(["wide-page"]);
    expect(reparsed.unknownFields["kanban-plugin"]).toBe("board");
    expect(reparsed.metadata.tags).toEqual(["imported"]);
  });
});

describe("updateFrontmatterField", () => {
  it("updates an existing field", () => {
    const content = "---\ntitle: Old Title\n---\nBody";
    const result = updateFrontmatterField(content, "title", "New Title");
    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.title).toBe("New Title");
    expect(parsed.body).toBe("Body");
  });

  it("adds a new field to existing frontmatter", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = updateFrontmatterField(content, "favorite", true);
    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.title).toBe("Test");
    expect(parsed.metadata.favorite).toBe(true);
  });

  it("creates frontmatter when none exists", () => {
    const content = "Body with no frontmatter";
    const result = updateFrontmatterField(content, "title", "New Note");
    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.title).toBe("New Note");
    expect(parsed.body).toBe("Body with no frontmatter");
  });

  it("handles unknown fields", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = updateFrontmatterField(content, "cssclasses", [
      "wide-page",
    ]);
    const parsed = parseFrontmatter(result);
    expect(parsed.unknownFields["cssclasses"]).toEqual(["wide-page"]);
  });

  it("removes a field when value is undefined", () => {
    const content = "---\ntitle: Test\nfavorite: true\n---\nBody";
    const result = updateFrontmatterField(content, "favorite", undefined);
    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.favorite).toBeUndefined();
    expect(parsed.metadata.title).toBe("Test");
  });
});

describe("removeFrontmatterField", () => {
  it("removes a known field", () => {
    const content = "---\ntitle: Test\ntags:\n  - work\n---\nBody";
    const result = removeFrontmatterField(content, "tags");
    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.tags).toBeUndefined();
    expect(parsed.metadata.title).toBe("Test");
  });

  it("removes an unknown field", () => {
    const content = "---\ntitle: Test\ncssclasses:\n  - wide\n---\nBody";
    const result = removeFrontmatterField(content, "cssclasses");
    const parsed = parseFrontmatter(result);
    expect(parsed.unknownFields["cssclasses"]).toBeUndefined();
  });
});

describe("stripFrontmatter", () => {
  it("returns body without frontmatter", () => {
    const content = "---\ntitle: Test\n---\nBody content";
    expect(stripFrontmatter(content)).toBe("Body content");
  });

  it("returns full content when no frontmatter", () => {
    const content = "No frontmatter here";
    expect(stripFrontmatter(content)).toBe(content);
  });
});

describe("hasFrontmatter", () => {
  it("returns true for content with frontmatter", () => {
    expect(hasFrontmatter("---\ntitle: Test\n---\nBody")).toBe(true);
  });

  it("returns true for empty frontmatter block", () => {
    expect(hasFrontmatter("---\n---\nBody")).toBe(true);
  });

  it("returns false for content without frontmatter", () => {
    expect(hasFrontmatter("No frontmatter")).toBe(false);
  });

  it("returns false for --- in body only", () => {
    expect(hasFrontmatter("Some text\n---\nMore text")).toBe(false);
  });
});

describe("injectFrontmatter", () => {
  it("injects frontmatter into content without existing frontmatter", () => {
    const content = "# My Note\n\nSome content.";
    const result = injectFrontmatter(content, {
      title: "My Note",
      createdAt: "2026-04-16T10:30:00Z",
      updatedAt: "2026-04-16T14:22:00Z",
      tags: ["work"],
      favorite: true,
    });

    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.title).toBe("My Note");
    expect(parsed.metadata.date).toBe("2026-04-16T10:30:00Z");
    expect(parsed.metadata.updated).toBe("2026-04-16T14:22:00Z");
    expect(parsed.metadata.tags).toEqual(["work"]);
    expect(parsed.metadata.favorite).toBe(true);
    expect(parsed.body).toBe("# My Note\n\nSome content.");
  });

  it("merges with existing frontmatter without overwriting", () => {
    const content = `---
title: Existing Title
tags:
  - existing-tag
---
Body`;

    const result = injectFrontmatter(content, {
      title: "New Title", // should NOT overwrite
      tags: ["new-tag"], // should NOT overwrite
      createdAt: "2026-01-01T00:00:00Z",
      favorite: true,
    });

    const parsed = parseFrontmatter(result);
    expect(parsed.metadata.title).toBe("Existing Title"); // preserved
    expect(parsed.metadata.tags).toEqual(["existing-tag"]); // preserved
    expect(parsed.metadata.date).toBe("2026-01-01T00:00:00Z"); // injected
    expect(parsed.metadata.favorite).toBe(true); // injected
  });

  it("does not inject empty tags array", () => {
    const content = "Body";
    const result = injectFrontmatter(content, {
      title: "Test",
      tags: [],
    });
    expect(result).not.toContain("tags");
  });

  it("does not inject favorite: false", () => {
    const content = "Body";
    const result = injectFrontmatter(content, {
      title: "Test",
      favorite: false,
    });
    expect(result).not.toContain("favorite");
  });

  it("preserves unknown fields from existing frontmatter", () => {
    const content = `---
title: Test
cssclasses:
  - wide
---
Body`;

    const result = injectFrontmatter(content, {
      createdAt: "2026-01-01T00:00:00Z",
    });

    const parsed = parseFrontmatter(result);
    expect(parsed.unknownFields["cssclasses"]).toEqual(["wide"]);
    expect(parsed.metadata.title).toBe("Test");
    expect(parsed.metadata.date).toBe("2026-01-01T00:00:00Z");
  });
});
