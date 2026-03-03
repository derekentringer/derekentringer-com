import type { CsvParser, RawParsedRow } from "./types.js";
import { parseCsvLines, parseMMDDYYYY } from "./csvUtils.js";

// Chase Checking CSV format:
// Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #

const chaseCheckingParser: CsvParser = {
  id: "chase-checking",
  parse(csvContent: string): RawParsedRow[] {
    const lines = parseCsvLines(csvContent);
    if (lines.length < 2) return [];

    // Skip header row
    const rows: RawParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i];
      if (fields.length < 4) continue;

      const date = parseMMDDYYYY(fields[1]);
      if (isNaN(date.getTime())) continue;

      const amount = parseFloat(fields[3]);
      if (isNaN(amount)) continue;

      rows.push({
        date,
        description: fields[2],
        amount,
        bankCategory: null,
      });
    }

    return rows;
  },
};

export default chaseCheckingParser;
