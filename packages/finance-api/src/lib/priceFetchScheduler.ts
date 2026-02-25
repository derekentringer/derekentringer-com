import type { FastifyBaseLogger } from "fastify";
import { loadConfig } from "../config.js";
import { listAllHoldingsWithTickers } from "../store/holdingStore.js";
import { updateHoldingPrice } from "../store/holdingStore.js";
import { upsertPriceHistory, upsertBenchmarkHistory } from "../store/priceHistoryStore.js";
import { fetchQuote } from "./finnhub.js";
import { getPrisma } from "./prisma.js";
import { encryptNumber } from "./encryption.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_DELAY_MS = 1100; // ~1 req per 1.1 seconds (stays under 60/min)

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastRunDate: string | null = null;
let logger: FastifyBaseLogger | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayET(): string {
  // Get current date in America/New_York timezone
  const now = new Date();
  const etDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return etDate.toISOString().slice(0, 10);
}

function currentHourET(): number {
  const now = new Date();
  const etDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return etDate.getHours();
}

async function runPriceFetchCycle(): Promise<void> {
  const config = loadConfig();

  // Only run if Finnhub API key is configured
  if (!config.finnhubApiKey) return;

  const today = todayET();
  const hour = currentHourET();

  // Only run once per day, after the configured hour
  if (lastRunDate === today) return;
  if (hour < config.priceFetchHour) return;

  lastRunDate = today;
  logger?.info("Starting daily price fetch cycle");

  try {
    // Fetch all holdings with tickers
    const holdings = await listAllHoldingsWithTickers();
    if (holdings.length === 0) {
      logger?.info("No holdings with tickers found, skipping price fetch");
      return;
    }

    const tickersSeen = new Set<string>();
    const today00 = new Date(today + "T00:00:00.000Z");

    for (const holding of holdings) {
      if (!holding.ticker) continue;

      try {
        const quote = await fetchQuote(holding.ticker);

        // Update holding price
        await updateHoldingPrice(holding.id, quote.c);

        // Record price history (dedupe by ticker)
        if (!tickersSeen.has(holding.ticker)) {
          tickersSeen.add(holding.ticker);
          await upsertPriceHistory(holding.ticker, quote.c, today00, "finnhub");
        }

        // Rate limit
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch (e) {
        // Skip failures for individual tickers, continue with others
        logger?.warn({ ticker: holding.ticker, error: e }, "Failed to fetch price for ticker");
      }
    }

    // Fetch SPY benchmark
    try {
      const spyQuote = await fetchQuote("SPY");
      await upsertBenchmarkHistory("SPY", spyQuote.c, today00);
    } catch (e) {
      logger?.warn({ error: e }, "Failed to fetch SPY benchmark price");
    }

    // Update account balances = sum of holding market values per account
    const prisma = getPrisma();
    const accountTotals = new Map<string, number>();
    // Also include holdings without tickers for total
    const allHoldings = await prisma.holding.findMany();
    const { decryptHolding } = await import("./mappers.js");
    const allDecrypted = allHoldings.map(decryptHolding);

    for (const h of allDecrypted) {
      if (h.marketValue != null) {
        accountTotals.set(h.accountId, (accountTotals.get(h.accountId) ?? 0) + h.marketValue);
      }
    }

    for (const [accountId, total] of accountTotals) {
      try {
        await prisma.account.update({
          where: { id: accountId },
          data: { currentBalance: encryptNumber(total) },
        });
      } catch {
        // Skip if account not found
      }
    }

    logger?.info({ tickerCount: tickersSeen.size }, "Daily price fetch cycle complete");
  } catch (e) {
    logger?.error({ error: e }, "Price fetch cycle failed");
  }
}

export function startPriceFetchScheduler(log: FastifyBaseLogger): void {
  logger = log;

  // Initial run after 30 seconds
  setTimeout(() => {
    runPriceFetchCycle().catch(() => {});
  }, 30_000);

  schedulerTimer = setInterval(() => {
    runPriceFetchCycle().catch(() => {});
  }, CHECK_INTERVAL_MS);

  log.info("Price fetch scheduler started");
}

export function stopPriceFetchScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  logger = null;
}
