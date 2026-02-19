import type { CsvParser, RawParsedRow } from "./types.js";
import { parseCsvLines } from "./csvUtils.js";

// Fidelity 401k CSV format:
// "Transaction Date","Investment","Contribution","Description","Activity","Price","Units","Amount",
// "2/13/2026 12:00:00 AM","Cash","Employee 401(k)","Contributions - Employee","Cash Receipts","1.000000","0.000000000","579.97",

function parseFidelityDate(dateStr: string): Date {
  // Format: "M/D/YYYY HH:MM:SS AM" — we only need the date part
  const datePart = dateStr.split(" ")[0];
  const [month, day, year] = datePart.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function buildDescription(fields: string[]): string {
  const investment = fields[1];
  const contribution = fields[2];
  const activity = fields[4];
  const units = parseFloat(fields[6]);
  const price = parseFloat(fields[5]);

  const parts: string[] = [investment];

  if (contribution) parts.push(contribution);
  if (activity) parts.push(activity);

  // Include units/price for purchases and sales (not for cash receipts)
  if (!isNaN(units) && units !== 0 && !isNaN(price) && price !== 1) {
    parts.push(`${units} units @ $${price}`);
  }

  return parts.join(" — ");
}

const fidelity401kParser: CsvParser = {
  id: "fidelity-401k",
  parse(csvContent: string): RawParsedRow[] {
    const lines = parseCsvLines(csvContent);
    if (lines.length < 2) return [];

    // Skip header row
    const rows: RawParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i];
      if (fields.length < 8) continue;

      const date = parseFidelityDate(fields[0]);
      if (isNaN(date.getTime())) continue;

      const amount = parseFloat(fields[7]);
      if (isNaN(amount)) continue;

      rows.push({
        date,
        description: buildDescription(fields),
        amount,
        bankCategory: fields[4] || null, // Activity as category
      });
    }

    return rows;
  },
};

export default fidelity401kParser;
