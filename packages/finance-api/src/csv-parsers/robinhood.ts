import type { CsvParser, RawParsedRow } from "./types.js";

// Robinhood export formats:
// CSV: "Activity Date","Process Date",... (comma-delimited, all fields quoted, 4-digit years)
// TSV: Activity Date\tProcess Date\t... (tab-delimited, only multiline fields quoted, 2-digit years)
// Amount uses accounting format: ($1.23) = negative, $1.23 = positive

/**
 * Detect whether the content is tab-delimited or comma-delimited.
 * Checks the first line — if it contains tabs, treat as TSV.
 */
function detectDelimiter(content: string): "\t" | "," {
  const firstLine = content.split(/\r?\n/)[0];
  return firstLine.includes("\t") ? "\t" : ",";
}

/**
 * Parse CSV/TSV content handling quoted fields that span multiple lines.
 */
function parseRecords(content: string): string[][] {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current.trim());
      current = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
        i++;
      }
      fields.push(current.trim());
      current = "";
      if (fields.some((f) => f !== "")) {
        records.push([...fields]);
      }
      fields.length = 0;
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  if (fields.some((f) => f !== "")) {
    records.push([...fields]);
  }

  return records;
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;
  const cleaned = amountStr.replace(/[$,\s]/g, "");
  const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const numStr = isNegative ? cleaned.slice(1, -1) : cleaned;
  const amount = parseFloat(numStr);
  if (isNaN(amount)) return null;
  return isNegative ? -amount : amount;
}

/**
 * Parse date in M/D/YY or M/D/YYYY format.
 */
function parseDate(dateStr: string): Date {
  const [month, day, year] = dateStr.split("/").map(Number);
  // Handle 2-digit years: 00-49 → 2000s, 50-99 → 1900s
  const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
  return new Date(fullYear, month - 1, day);
}

const robinhoodParser: CsvParser = {
  id: "robinhood",
  parse(csvContent: string): RawParsedRow[] {
    const records = parseRecords(csvContent);
    if (records.length < 2) return [];

    const rows: RawParsedRow[] = [];

    // Skip header row
    for (let i = 1; i < records.length; i++) {
      const fields = records[i];
      if (fields.length < 9) continue;

      // Column indices:
      // 0: Activity Date, 3: Instrument, 4: Description, 5: Trans Code, 8: Amount
      const dateStr = fields[0];
      const instrument = fields[3];
      const description = fields[4];
      const transCode = fields[5];
      const amountStr = fields[8];

      // Parse date (M/D/YYYY or M/D/YY)
      const date = parseDate(dateStr);
      if (isNaN(date.getTime())) continue;

      // Parse amount — skip rows with no amount (stock splits, conversions)
      const amount = parseAmount(amountStr);
      if (amount === null) continue;

      // Build description: ticker + first line of description
      const descFirstLine = description.split("\n")[0].trim();
      const fullDesc = instrument
        ? `${instrument} ${descFirstLine}`
        : descFirstLine;

      rows.push({
        date,
        description: fullDesc,
        amount,
        bankCategory: transCode || null,
      });
    }

    return rows;
  },
};

export default robinhoodParser;
