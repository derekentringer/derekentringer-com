import {
  toggleBold,
  toggleItalic,
  insertHeading,
  insertLink,
  insertList,
  insertCheckbox,
  insertCode,
  insertQuote,
} from "@/lib/editorActions";

describe("editorActions", () => {
  describe("toggleBold", () => {
    it("wraps selected text with **", () => {
      const result = toggleBold("hello world", 6, 11);
      expect(result.text).toBe("hello **world**");
      expect(result.selection).toEqual({ start: 8, end: 13 });
    });

    it("inserts ** at cursor when no selection", () => {
      const result = toggleBold("hello ", 6, 6);
      expect(result.text).toBe("hello ****");
      expect(result.selection).toEqual({ start: 8, end: 8 });
    });

    it("unwraps already bolded text", () => {
      const result = toggleBold("hello **world**", 8, 13);
      expect(result.text).toBe("hello world");
      expect(result.selection).toEqual({ start: 6, end: 11 });
    });
  });

  describe("toggleItalic", () => {
    it("wraps selected text with *", () => {
      const result = toggleItalic("hello world", 6, 11);
      expect(result.text).toBe("hello *world*");
      expect(result.selection).toEqual({ start: 7, end: 12 });
    });

    it("unwraps already italic text", () => {
      const result = toggleItalic("hello *world*", 7, 12);
      expect(result.text).toBe("hello world");
      expect(result.selection).toEqual({ start: 6, end: 11 });
    });
  });

  describe("insertHeading", () => {
    it("adds # to line start", () => {
      const result = insertHeading("hello world", 0, 0);
      expect(result.text).toBe("# hello world");
    });

    it("cycles heading level", () => {
      const result = insertHeading("# hello", 2, 2);
      expect(result.text).toBe("## hello");
    });

    it("removes heading at level 6", () => {
      const result = insertHeading("###### hello", 7, 7);
      expect(result.text).toBe("hello");
    });

    it("works on middle line", () => {
      const result = insertHeading("first\nsecond\nthird", 6, 6);
      expect(result.text).toBe("first\n# second\nthird");
    });
  });

  describe("insertLink", () => {
    it("wraps selected text as link text", () => {
      const result = insertLink("hello world", 6, 11);
      expect(result.text).toBe("hello [world](url)");
      expect(result.selection).toEqual({ start: 13, end: 16 });
    });

    it("inserts link template at cursor", () => {
      const result = insertLink("hello ", 6, 6);
      expect(result.text).toBe("hello [link](url)");
      expect(result.selection).toEqual({ start: 7, end: 11 });
    });
  });

  describe("insertList", () => {
    it("adds - to line start", () => {
      const result = insertList("hello", 0, 0);
      expect(result.text).toBe("- hello");
      expect(result.selection).toEqual({ start: 2, end: 2 });
    });

    it("removes - from line start if already present", () => {
      const result = insertList("- hello", 2, 2);
      expect(result.text).toBe("hello");
    });
  });

  describe("insertCheckbox", () => {
    it("adds - [ ] to line start", () => {
      const result = insertCheckbox("hello", 0, 0);
      expect(result.text).toBe("- [ ] hello");
      expect(result.selection).toEqual({ start: 6, end: 6 });
    });

    it("removes - [ ] from line start if already present", () => {
      const result = insertCheckbox("- [ ] hello", 6, 6);
      expect(result.text).toBe("hello");
    });
  });

  describe("insertCode", () => {
    it("wraps inline selection with backtick", () => {
      const result = insertCode("hello world", 6, 11);
      expect(result.text).toBe("hello `world`");
      expect(result.selection).toEqual({ start: 7, end: 12 });
    });

    it("wraps multiline selection with code fence", () => {
      const result = insertCode("hello\nworld", 0, 11);
      expect(result.text).toBe("```\nhello\nworld\n```");
    });

    it("unwraps inline code", () => {
      const result = insertCode("hello `world`", 7, 12);
      expect(result.text).toBe("hello world");
      expect(result.selection).toEqual({ start: 6, end: 11 });
    });
  });

  describe("insertQuote", () => {
    it("adds > to line start", () => {
      const result = insertQuote("hello", 0, 0);
      expect(result.text).toBe("> hello");
      expect(result.selection).toEqual({ start: 2, end: 2 });
    });

    it("removes > from line start if already present", () => {
      const result = insertQuote("> hello", 2, 2);
      expect(result.text).toBe("hello");
    });
  });
});
