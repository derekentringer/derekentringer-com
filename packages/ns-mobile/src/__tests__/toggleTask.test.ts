import {
  markTasks,
  toggleTask,
  parseTaskUrl,
} from "../lib/toggleTask";

describe("markTasks", () => {
  it("rewrites a single unchecked task to an empty-task link", () => {
    const out = markTasks("- [ ] write tests");
    expect(out).toBe("- [☐](#task-empty:0) write tests");
  });

  it("rewrites a single checked task to a done-task link", () => {
    const out = markTasks("- [x] write tests");
    expect(out).toBe("- [☑](#task-done:0) write tests");
  });

  it("accepts uppercase X for checked", () => {
    const out = markTasks("- [X] write tests");
    expect(out).toBe("- [☑](#task-done:0) write tests");
  });

  it("indexes multiple tasks in source order", () => {
    const out = markTasks("- [ ] a\n- [x] b\n- [ ] c");
    expect(out).toBe(
      "- [☐](#task-empty:0) a\n- [☑](#task-done:1) b\n- [☐](#task-empty:2) c",
    );
  });

  it("preserves nested task indentation", () => {
    const out = markTasks("- [ ] top\n  - [x] nested");
    expect(out).toBe(
      "- [☐](#task-empty:0) top\n  - [☑](#task-done:1) nested",
    );
  });

  it("preserves alternative bullet markers", () => {
    expect(markTasks("* [ ] a")).toBe("* [☐](#task-empty:0) a");
    expect(markTasks("+ [x] b")).toBe("+ [☑](#task-done:0) b");
  });

  it("does not touch lines without leading task markers", () => {
    const input = "- plain item\nthis line has [ ] in the middle";
    expect(markTasks(input)).toBe(input);
  });

  it("handles a mixed list (plain + task items interleaved)", () => {
    const out = markTasks(
      "- plain\n- [ ] task A\n- another plain\n- [x] task B",
    );
    expect(out).toBe(
      "- plain\n- [☐](#task-empty:0) task A\n- another plain\n- [☑](#task-done:1) task B",
    );
  });
});

describe("toggleTask", () => {
  it("flips an unchecked task at index 0", () => {
    expect(toggleTask("- [ ] a", 0)).toBe("- [x] a");
  });

  it("flips a checked task at index 0", () => {
    expect(toggleTask("- [x] a", 0)).toBe("- [ ] a");
  });

  it("flips only the targeted task in a list", () => {
    const input = "- [ ] a\n- [ ] b\n- [ ] c";
    expect(toggleTask(input, 1)).toBe("- [ ] a\n- [x] b\n- [ ] c");
  });

  it("returns the input unchanged for an out-of-range index", () => {
    const input = "- [ ] a\n- [x] b";
    expect(toggleTask(input, 5)).toBe(input);
  });

  it("respects nested and mixed list structure", () => {
    const input = "- plain\n  - [ ] nested\n- [x] top";
    expect(toggleTask(input, 0)).toBe(
      "- plain\n  - [x] nested\n- [x] top",
    );
    expect(toggleTask(input, 1)).toBe(
      "- plain\n  - [ ] nested\n- [ ] top",
    );
  });

  it("preserves leading whitespace exactly", () => {
    expect(toggleTask("   - [ ] indented", 0)).toBe("   - [x] indented");
  });

  it("normalizes uppercase X to lowercase x on toggle", () => {
    // toggling [X] → [ ], then [ ] → [x] (lowercase canonical form)
    expect(toggleTask("- [X] a", 0)).toBe("- [ ] a");
  });
});

describe("parseTaskUrl", () => {
  it("parses an empty-task URL", () => {
    expect(parseTaskUrl("#task-empty:3")).toEqual({
      taskIndex: 3,
      checked: false,
    });
  });

  it("parses a done-task URL", () => {
    expect(parseTaskUrl("#task-done:0")).toEqual({
      taskIndex: 0,
      checked: true,
    });
  });

  it("returns null for non-task URLs", () => {
    expect(parseTaskUrl("https://example.com")).toBeNull();
    expect(parseTaskUrl("#wiki:note-1")).toBeNull();
    expect(parseTaskUrl("#wiki-broken:foo")).toBeNull();
    expect(parseTaskUrl("")).toBeNull();
  });

  it("returns null for malformed task URLs", () => {
    expect(parseTaskUrl("#task-empty:")).toBeNull();
    expect(parseTaskUrl("#task-other:0")).toBeNull();
    expect(parseTaskUrl("#task-empty:abc")).toBeNull();
  });
});

describe("markTasks + toggleTask round-trip", () => {
  it("toggle indices line up with markTasks indices", () => {
    const source = "- [ ] a\n- [x] b\n- [ ] c";
    const marked = markTasks(source);
    // marked encodes indices 0,1,2 in order
    expect(marked).toContain("#task-empty:0");
    expect(marked).toContain("#task-done:1");
    expect(marked).toContain("#task-empty:2");
    // toggling index 1 in source flips b
    expect(toggleTask(source, 1)).toBe("- [ ] a\n- [ ] b\n- [ ] c");
  });
});
