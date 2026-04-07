export interface ParsedTable {
  startLine: number;
  endLine: number;
  headers: string[];
  alignments: ("left" | "center" | "right" | "none")[];
  rows: string[][];
}

export type SortDirection = "none" | "asc" | "desc";

const ESCAPED_PIPE_PLACEHOLDER = "\x00EP\x00";

export function parseRow(line: string): string[] {
  const replaced = line.replace(/\\\|/g, ESCAPED_PIPE_PLACEHOLDER);
  const trimmed = replaced.trim();
  const stripped =
    trimmed.startsWith("|") && trimmed.endsWith("|")
      ? trimmed.slice(1, -1)
      : trimmed;
  return stripped
    .split("|")
    .map((cell) => cell.replace(/\x00EP\x00/g, "\\|").trim());
}

export function parseAlignments(
  separatorLine: string,
): ParsedTable["alignments"] {
  return parseRow(separatorLine).map((cell) => {
    const trimmed = cell.trim().replace(/\s/g, "");
    const left = trimmed.startsWith(":");
    const right = trimmed.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  });
}

function isSeparatorRow(line: string): boolean {
  const cells = parseRow(line);
  return (
    cells.length > 0 && cells.every((cell) => /^\s*:?-{1,}:?\s*$/.test(cell))
  );
}

export function findTables(markdown: string): ParsedTable[] {
  if (!markdown) return [];

  const lines = markdown.split("\n");
  const tables: ParsedTable[] = [];
  let inCodeBlock = false;
  let i = 0;

  while (i < lines.length) {
    if (/^\s{0,3}```/.test(lines[i])) {
      inCodeBlock = !inCodeBlock;
      i++;
      continue;
    }
    if (inCodeBlock) {
      i++;
      continue;
    }

    // Check for header row + separator row pattern
    if (
      i + 1 < lines.length &&
      lines[i].includes("|") &&
      isSeparatorRow(lines[i + 1])
    ) {
      const headers = parseRow(lines[i]);
      const alignments = parseAlignments(lines[i + 1]);
      const startLine = i;
      const rows: string[][] = [];

      i += 2; // skip header + separator

      // Collect body rows
      while (i < lines.length && lines[i].includes("|") && !isSeparatorRow(lines[i])) {
        // Stop if it looks like a new table header (next line is separator)
        if (i + 1 < lines.length && isSeparatorRow(lines[i + 1])) break;
        rows.push(parseRow(lines[i]));
        i++;
      }

      tables.push({
        startLine,
        endLine: i - 1,
        headers,
        alignments,
        rows,
      });
      continue;
    }

    i++;
  }

  return tables;
}

function alignmentMarker(
  alignment: ParsedTable["alignments"][number],
  width: number,
): string {
  const dashes = Math.max(width, 3);
  switch (alignment) {
    case "left":
      return ":" + "-".repeat(dashes - 1);
    case "right":
      return "-".repeat(dashes - 1) + ":";
    case "center":
      return ":" + "-".repeat(dashes - 2) + ":";
    default:
      return "-".repeat(dashes);
  }
}

export function serializeTable(table: ParsedTable): string {
  const colCount = table.headers.length;

  // Calculate max widths
  const widths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = (table.headers[c] || "").length;
    for (const row of table.rows) {
      max = Math.max(max, (row[c] || "").length);
    }
    widths.push(Math.max(max, 3));
  }

  const pad = (val: string, col: number) => {
    const w = widths[col];
    const align = table.alignments[col] || "none";
    if (align === "right") return val.padStart(w);
    if (align === "center") {
      const total = w - val.length;
      const left = Math.floor(total / 2);
      return " ".repeat(left) + val + " ".repeat(total - left);
    }
    return val.padEnd(w);
  };

  const headerLine =
    "| " + table.headers.map((h, i) => pad(h, i)).join(" | ") + " |";
  const separatorLine =
    "| " +
    widths
      .map((w, i) => alignmentMarker(table.alignments[i] || "none", w))
      .join(" | ") +
    " |";
  const bodyLines = table.rows.map(
    (row) =>
      "| " + row.map((cell, i) => pad(cell || "", i)).join(" | ") + " |",
  );

  return [headerLine, separatorLine, ...bodyLines].join("\n");
}

/**
 * Returns text changes needed to reformat all tables in a document with
 * padded column spacing. Returns an empty array if no changes are needed.
 */
export function formatTableChanges(
  doc: string,
): { from: number; to: number; insert: string }[] {
  const tables = findTables(doc);
  if (tables.length === 0) return [];
  const lines = doc.split("\n");
  const changes: { from: number; to: number; insert: string }[] = [];
  for (const table of tables) {
    const formatted = serializeTable(table);
    const fromOffset =
      lines.slice(0, table.startLine).join("\n").length +
      (table.startLine > 0 ? 1 : 0);
    const toOffset = lines.slice(0, table.endLine + 1).join("\n").length;
    const original = doc.slice(fromOffset, toOffset);
    if (formatted !== original) {
      changes.push({ from: fromOffset, to: toOffset, insert: formatted });
    }
  }
  return changes;
}

/**
 * Returns text changes to reformat a single table identified by its start
 * line (0-indexed) in the document. Returns an empty array if no change needed.
 */
export function formatTableAtLine(
  doc: string,
  startLine: number,
): { from: number; to: number; insert: string }[] {
  const tables = findTables(doc);
  const table = tables.find((t) => t.startLine === startLine);
  if (!table) return [];
  const lines = doc.split("\n");
  const formatted = serializeTable(table);
  const fromOffset =
    lines.slice(0, table.startLine).join("\n").length +
    (table.startLine > 0 ? 1 : 0);
  const toOffset = lines.slice(0, table.endLine + 1).join("\n").length;
  const original = doc.slice(fromOffset, toOffset);
  if (formatted === original) return [];
  return [{ from: fromOffset, to: toOffset, insert: formatted }];
}

export function updateCell(
  markdown: string,
  tableIndex: number,
  rowIndex: number,
  colIndex: number,
  newValue: string,
): string {
  const tables = findTables(markdown);
  if (tableIndex < 0 || tableIndex >= tables.length) return markdown;

  const table = tables[tableIndex];
  if (rowIndex < 0 || rowIndex >= table.rows.length) return markdown;
  if (colIndex < 0 || colIndex >= table.headers.length) return markdown;

  // Update the cell value
  const updatedTable = { ...table, rows: table.rows.map((r) => [...r]) };
  while (updatedTable.rows[rowIndex].length <= colIndex) {
    updatedTable.rows[rowIndex].push("");
  }
  updatedTable.rows[rowIndex][colIndex] = newValue;

  return replaceTableInDocument(markdown, table, updatedTable);
}

export function sortTableByColumn(
  markdown: string,
  tableIndex: number,
  colIndex: number,
  direction: "asc" | "desc",
): string {
  const tables = findTables(markdown);
  if (tableIndex < 0 || tableIndex >= tables.length) return markdown;

  const table = tables[tableIndex];
  if (colIndex < 0 || colIndex >= table.headers.length) return markdown;

  const sortedRows = [...table.rows.map((r) => [...r])];
  sortedRows.sort((a, b) => {
    const valA = a[colIndex] || "";
    const valB = b[colIndex] || "";
    const cmp = valA.localeCompare(valB, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return direction === "desc" ? -cmp : cmp;
  });

  const updatedTable = { ...table, rows: sortedRows };
  return replaceTableInDocument(markdown, table, updatedTable);
}

function replaceTableInDocument(
  markdown: string,
  originalTable: ParsedTable,
  updatedTable: ParsedTable,
): string {
  const lines = markdown.split("\n");
  const before = lines.slice(0, originalTable.startLine);
  const after = lines.slice(originalTable.endLine + 1);
  const serialized = serializeTable(updatedTable);
  return [...before, serialized, ...after].join("\n");
}
