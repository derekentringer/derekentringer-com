import type { CsvParser } from "./types.js";
import chaseCheckingParser from "./chaseChecking.js";
import chaseCreditParser from "./chaseCredit.js";
import amexHysParser from "./amexHys.js";

const parsers: Map<string, CsvParser> = new Map();
parsers.set(chaseCheckingParser.id, chaseCheckingParser);
parsers.set(chaseCreditParser.id, chaseCreditParser);
parsers.set(amexHysParser.id, amexHysParser);

export function getParser(id: string): CsvParser | undefined {
  return parsers.get(id);
}

export function getParserIds(): string[] {
  return Array.from(parsers.keys());
}
