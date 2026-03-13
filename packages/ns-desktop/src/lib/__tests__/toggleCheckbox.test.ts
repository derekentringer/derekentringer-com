import { describe, it, expect } from "vitest";
import { toggleCheckbox } from "../toggleCheckbox.ts";

describe("toggleCheckbox", () => {
  it("toggles unchecked to checked (first checkbox)", () => {
    const input = "- [ ] task one\n- [ ] task two";
    const result = toggleCheckbox(input, 0);
    expect(result).toBe("- [x] task one\n- [ ] task two");
  });

  it("toggles checked to unchecked", () => {
    const input = "- [x] task one\n- [ ] task two";
    const result = toggleCheckbox(input, 0);
    expect(result).toBe("- [ ] task one\n- [ ] task two");
  });

  it("toggles specific checkbox by index", () => {
    const input = "- [ ] first\n- [ ] second\n- [ ] third\n- [ ] fourth\n- [ ] fifth";
    const result = toggleCheckbox(input, 2);
    expect(result).toBe("- [ ] first\n- [ ] second\n- [x] third\n- [ ] fourth\n- [ ] fifth");
  });

  it("preserves surrounding content unchanged", () => {
    const input = "# Title\n\nSome text.\n\n- [ ] task\n\nMore text.";
    const result = toggleCheckbox(input, 0);
    expect(result).toBe("# Title\n\nSome text.\n\n- [x] task\n\nMore text.");
  });

  it("handles nested/indented checkboxes", () => {
    const input = "- [ ] parent\n  - [ ] child\n    - [ ] grandchild";
    const result = toggleCheckbox(input, 1);
    expect(result).toBe("- [ ] parent\n  - [x] child\n    - [ ] grandchild");
  });

  it("handles uppercase [X]", () => {
    const input = "- [X] done task\n- [ ] pending";
    const result = toggleCheckbox(input, 0);
    expect(result).toBe("- [ ] done task\n- [ ] pending");
  });

  it("handles * and + list markers", () => {
    const input = "* [ ] star item\n+ [ ] plus item";
    const result = toggleCheckbox(input, 1);
    expect(result).toBe("* [ ] star item\n+ [x] plus item");
  });

  it("handles ordered list checkboxes", () => {
    const input = "1. [ ] first\n2. [ ] second";
    const result = toggleCheckbox(input, 1);
    expect(result).toBe("1. [ ] first\n2. [x] second");
  });

  it("returns content unchanged for out-of-range index", () => {
    const input = "- [ ] only one";
    const result = toggleCheckbox(input, 5);
    expect(result).toBe("- [ ] only one");
  });
});
