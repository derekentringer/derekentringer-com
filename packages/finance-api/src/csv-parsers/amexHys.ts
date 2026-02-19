import type { CsvParser, RawParsedRow } from "./types.js";
import { parseCsvLines, parseMMDDYYYY } from "./csvUtils.js";

// Amex HYS CSV format (placeholder):
// Date,Description,Amount,Balance

const amexHysParser: CsvParser = {
  id: "amex-hys",
  parse(csvContent: string): RawParsedRow[] {
    const lines = parseCsvLines(csvContent);
    if (lines.length < 2) return [];

    const rows: RawParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i];
      if (fields.length < 3) continue;

      const date = parseMMDDYYYY(fields[0]);
      if (isNaN(date.getTime())) continue;

      const amount = parseFloat(fields[2]);
      if (isNaN(amount)) continue;

      rows.push({
        date,
        description: fields[1],
        amount,
        bankCategory: null,
      });
    }

    return rows;
  },
};

export default amexHysParser;
