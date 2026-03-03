import type { CsvParser, RawParsedRow } from "./types.js";
import { parseCsvLines } from "./csvUtils.js";

// Amex HYS CSV format (no header row):
// 2026-01-26,"Interest Payment",430.74

function parseYYYYMMDD(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const amexHysParser: CsvParser = {
  id: "amex-hys",
  parse(csvContent: string): RawParsedRow[] {
    const lines = parseCsvLines(csvContent);
    if (lines.length < 1) return [];

    const rows: RawParsedRow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const fields = lines[i];
      if (fields.length < 3) continue;

      const date = parseYYYYMMDD(fields[0]);
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
