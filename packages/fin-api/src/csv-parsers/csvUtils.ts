/**
 * Lightweight CSV line parser handling quoted fields and BOM stripping.
 */
export function parseCsvLines(content: string): string[][] {
  // Strip UTF-8 BOM
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = text.split(/\r?\n/);
  const result: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    result.push(parseCsvLine(trimmed));
  }

  return result;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

export function parseMMDDYYYY(dateStr: string): Date {
  const [month, day, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}
