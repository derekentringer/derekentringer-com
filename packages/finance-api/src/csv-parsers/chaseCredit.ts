import type { CsvParser, RawParsedRow } from "./types.js";
import { parseCsvLines, parseMMDDYYYY } from "./csvUtils.js";

// Chase Credit Card CSV format:
// Transaction Date,Post Date,Description,Category,Type,Amount,Memo

const chaseCreditParser: CsvParser = {
  id: "chase-credit",
  parse(csvContent: string): RawParsedRow[] {
    const lines = parseCsvLines(csvContent);
    if (lines.length < 2) return [];

    const rows: RawParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i];
      if (fields.length < 6) continue;

      const date = parseMMDDYYYY(fields[0]);
      if (isNaN(date.getTime())) continue;

      const amount = parseFloat(fields[5]);
      if (isNaN(amount)) continue;

      const bankCategory = fields[3] || null;

      rows.push({
        date,
        description: fields[2],
        amount,
        bankCategory,
      });
    }

    return rows;
  },
};

export default chaseCreditParser;
