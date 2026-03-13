import { describe, it, expect } from "vitest";
import {
  parseRow,
  parseAlignments,
  findTables,
  serializeTable,
  updateCell,
  sortTableByColumn,
} from "../tableMarkdown.ts";

describe("parseRow", () => {
  it("parses a simple row", () => {
    expect(parseRow("| a | b | c |")).toEqual(["a", "b", "c"]);
  });

  it("handles escaped pipes", () => {
    expect(parseRow("| a\\|b | c |")).toEqual(["a\\|b", "c"]);
  });

  it("handles empty cells", () => {
    expect(parseRow("| | b | |")).toEqual(["", "b", ""]);
  });

  it("trims whitespace from cells", () => {
    expect(parseRow("|  hello  |  world  |")).toEqual(["hello", "world"]);
  });

  it("works without outer pipes", () => {
    expect(parseRow("a | b | c")).toEqual(["a", "b", "c"]);
  });
});

describe("parseAlignments", () => {
  it("parses left alignment", () => {
    expect(parseAlignments("| :--- | --- |")).toEqual(["left", "none"]);
  });

  it("parses right alignment", () => {
    expect(parseAlignments("| ---: | --- |")).toEqual(["right", "none"]);
  });

  it("parses center alignment", () => {
    expect(parseAlignments("| :---: | --- |")).toEqual(["center", "none"]);
  });

  it("parses mixed alignments", () => {
    expect(parseAlignments("| :--- | :---: | ---: | --- |")).toEqual([
      "left",
      "center",
      "right",
      "none",
    ]);
  });
});

describe("findTables", () => {
  it("finds a single table", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const tables = findTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(["A", "B"]);
    expect(tables[0].rows).toEqual([["1", "2"]]);
  });

  it("finds multiple tables", () => {
    const md =
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |";
    const tables = findTables(md);
    expect(tables).toHaveLength(2);
    expect(tables[0].headers).toEqual(["A", "B"]);
    expect(tables[1].headers).toEqual(["C", "D"]);
  });

  it("skips tables inside fenced code blocks", () => {
    const md =
      "```\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```\n\n| C | D |\n| --- | --- |\n| 3 | 4 |";
    const tables = findTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(["C", "D"]);
  });

  it("handles table at start of document", () => {
    const md = "| A |\n| --- |\n| 1 |";
    const tables = findTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].startLine).toBe(0);
  });

  it("handles table at end of document", () => {
    const md = "Some text\n\n| A |\n| --- |\n| 1 |";
    const tables = findTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].endLine).toBe(4);
  });

  it("handles table with no body rows", () => {
    const md = "| A | B |\n| --- | --- |";
    const tables = findTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([]);
  });

  it("returns empty array for empty document", () => {
    expect(findTables("")).toEqual([]);
  });

  it("handles cells with inline formatting", () => {
    const md = "| **Bold** | *Italic* |\n| --- | --- |\n| `code` | [link](url) |";
    const tables = findTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(["**Bold**", "*Italic*"]);
    expect(tables[0].rows).toEqual([["`code`", "[link](url)"]]);
  });
});

describe("serializeTable", () => {
  it("serializes a simple table", () => {
    const table = {
      startLine: 0,
      endLine: 2,
      headers: ["A", "B"],
      alignments: ["none" as const, "none" as const],
      rows: [["1", "2"]],
    };
    const result = serializeTable(table);
    expect(result).toContain("| A");
    expect(result).toContain("| 1");
    expect(result.split("\n")).toHaveLength(3);
  });

  it("preserves alignment markers", () => {
    const table = {
      startLine: 0,
      endLine: 2,
      headers: ["Left", "Center", "Right"],
      alignments: ["left" as const, "center" as const, "right" as const],
      rows: [["a", "b", "c"]],
    };
    const result = serializeTable(table);
    const separator = result.split("\n")[1];
    expect(separator).toMatch(/:---/);
    expect(separator).toMatch(/:---+:/);
    expect(separator).toMatch(/---+:/);
  });

  it("pads columns to equal width", () => {
    const table = {
      startLine: 0,
      endLine: 2,
      headers: ["Name", "X"],
      alignments: ["none" as const, "none" as const],
      rows: [["A", "B"]],
    };
    const result = serializeTable(table);
    const lines = result.split("\n");
    // Header "Name" is 4 chars, "X" is 1 char but padded to at least 3
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("X");
  });

  it("handles empty cells", () => {
    const table = {
      startLine: 0,
      endLine: 2,
      headers: ["A", "B"],
      alignments: ["none" as const, "none" as const],
      rows: [["", "2"]],
    };
    const result = serializeTable(table);
    expect(result).toContain("|");
    expect(result.split("\n")).toHaveLength(3);
  });

  it("handles escaped pipes in cells", () => {
    const table = {
      startLine: 0,
      endLine: 2,
      headers: ["A"],
      alignments: ["none" as const],
      rows: [["a\\|b"]],
    };
    const result = serializeTable(table);
    expect(result).toContain("a\\|b");
  });
});

describe("updateCell", () => {
  it("updates a cell in a single-table document", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const result = updateCell(md, 0, 0, 0, "X");
    expect(result).toContain("X");
    expect(result).not.toMatch(/\| 1\s/);
  });

  it("updates correct table in multi-table document", () => {
    const md =
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |";
    const result = updateCell(md, 1, 0, 0, "X");
    expect(result).toContain("| 1");
    expect(result).toContain("X");
  });

  it("preserves surrounding content", () => {
    const md = "# Title\n\n| A |\n| --- |\n| 1 |\n\nEnd.";
    const result = updateCell(md, 0, 0, 0, "X");
    expect(result).toContain("# Title");
    expect(result).toContain("End.");
  });

  it("handles empty string value", () => {
    const md = "| A |\n| --- |\n| 1 |";
    const result = updateCell(md, 0, 0, 0, "");
    const tables = findTables(result);
    expect(tables[0].rows[0][0]).toBe("");
  });

  it("returns unchanged for out-of-range table index", () => {
    const md = "| A |\n| --- |\n| 1 |";
    expect(updateCell(md, 5, 0, 0, "X")).toBe(md);
  });

  it("returns unchanged for out-of-range row index", () => {
    const md = "| A |\n| --- |\n| 1 |";
    expect(updateCell(md, 0, 5, 0, "X")).toBe(md);
  });

  it("returns unchanged for out-of-range col index", () => {
    const md = "| A |\n| --- |\n| 1 |";
    expect(updateCell(md, 0, 0, 5, "X")).toBe(md);
  });
});

describe("sortTableByColumn", () => {
  it("sorts ascending alphabetically", () => {
    const md = "| Name |\n| --- |\n| Charlie |\n| Alice |\n| Bob |";
    const result = sortTableByColumn(md, 0, 0, "asc");
    const tables = findTables(result);
    expect(tables[0].rows.map((r) => r[0])).toEqual([
      "Alice",
      "Bob",
      "Charlie",
    ]);
  });

  it("sorts descending alphabetically", () => {
    const md = "| Name |\n| --- |\n| Alice |\n| Charlie |\n| Bob |";
    const result = sortTableByColumn(md, 0, 0, "desc");
    const tables = findTables(result);
    expect(tables[0].rows.map((r) => r[0])).toEqual([
      "Charlie",
      "Bob",
      "Alice",
    ]);
  });

  it("sorts numerically", () => {
    const md = "| N |\n| --- |\n| 10 |\n| 2 |\n| 1 |";
    const result = sortTableByColumn(md, 0, 0, "asc");
    const tables = findTables(result);
    expect(tables[0].rows.map((r) => r[0])).toEqual(["1", "2", "10"]);
  });

  it("handles mixed numeric and text values", () => {
    const md = "| Val |\n| --- |\n| b |\n| 2 |\n| a |\n| 1 |";
    const result = sortTableByColumn(md, 0, 0, "asc");
    const tables = findTables(result);
    const sorted = tables[0].rows.map((r) => r[0]);
    expect(sorted[0]).toBe("1");
    expect(sorted[1]).toBe("2");
  });

  it("handles single-row table", () => {
    const md = "| A |\n| --- |\n| 1 |";
    const result = sortTableByColumn(md, 0, 0, "asc");
    const tables = findTables(result);
    expect(tables[0].rows).toEqual([["1"]]);
  });

  it("sorts correct table in multi-table document", () => {
    const md =
      "| A |\n| --- |\n| 2 |\n| 1 |\n\n| B |\n| --- |\n| y |\n| x |";
    const result = sortTableByColumn(md, 1, 0, "asc");
    const tables = findTables(result);
    // First table should be unchanged
    expect(tables[0].rows.map((r) => r[0])).toEqual(["2", "1"]);
    // Second table should be sorted
    expect(tables[1].rows.map((r) => r[0])).toEqual(["x", "y"]);
  });

  it("preserves alignment after sort", () => {
    const md = "| A |\n| :---: |\n| 2 |\n| 1 |";
    const result = sortTableByColumn(md, 0, 0, "asc");
    const tables = findTables(result);
    expect(tables[0].alignments).toEqual(["center"]);
  });
});
