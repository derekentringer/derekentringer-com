import { loadConfig } from "../config.js";

export interface FinnhubQuote {
  /** Current price */
  c: number;
  /** Change */
  d: number;
  /** Percent change */
  dp: number;
  /** High price of the day */
  h: number;
  /** Low price of the day */
  l: number;
  /** Open price of the day */
  o: number;
  /** Previous close price */
  pc: number;
  /** Timestamp */
  t: number;
}

export async function fetchQuote(ticker: string): Promise<FinnhubQuote> {
  const config = loadConfig();
  if (!config.finnhubApiKey) {
    throw new Error("Finnhub API key not configured");
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${config.finnhubApiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = (await response.json()) as FinnhubQuote;

  // Finnhub returns zeros for invalid tickers
  if (data.c === 0 && data.d === 0 && data.dp === 0) {
    throw new Error(`No quote data available for ticker: ${ticker}`);
  }

  return data;
}
