export interface RawParsedRow {
  date: Date;
  description: string;
  amount: number;
  bankCategory?: string | null;
}

export interface CsvParser {
  id: string;
  parse(csvContent: string): RawParsedRow[];
}
