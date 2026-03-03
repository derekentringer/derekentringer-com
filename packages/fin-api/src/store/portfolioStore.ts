import type {
  AssetAllocationSlice,
  AssetAllocationResponse,
  PerformancePeriod,
  PerformancePoint,
  PerformanceSummary,
  PerformanceResponse,
  RebalanceSuggestion,
  RebalanceResponse,
  AssetClass,
} from "@derekentringer/shared";
import { ASSET_CLASS_LABELS } from "@derekentringer/shared";
import { getPrisma } from "../lib/prisma.js";
import { decryptHolding } from "../lib/mappers.js";
import { listTargetAllocations } from "./targetAllocationStore.js";
import { getPriceHistory, getBenchmarkHistory } from "./priceHistoryStore.js";
import { getCashBalance } from "./accountStore.js";

export async function computeAssetAllocation(
  accountId?: string | null,
): Promise<AssetAllocationResponse> {
  const prisma = getPrisma();

  // Fetch holdings, optionally filtered by account
  const where = accountId ? { accountId } : {};
  const rows = await prisma.holding.findMany({ where });
  const holdings = rows.map(decryptHolding);

  // Group by asset class
  const classMap = new Map<string, number>();
  let totalMarketValue = 0;

  for (const h of holdings) {
    const mv = h.marketValue ?? 0;
    classMap.set(h.assetClass, (classMap.get(h.assetClass) ?? 0) + mv);
    totalMarketValue += mv;
  }

  // For portfolio-wide queries, include savings/HYS balances as cash
  if (!accountId) {
    const cashBalance = await getCashBalance();
    if (cashBalance > 0) {
      classMap.set("cash", (classMap.get("cash") ?? 0) + cashBalance);
      totalMarketValue += cashBalance;
    }
  }

  // Get target allocations for comparison
  const targets = await listTargetAllocations(accountId ?? null);
  const targetMap = new Map<string, number>();
  for (const t of targets) {
    targetMap.set(t.assetClass, t.targetPct);
  }

  const slices: AssetAllocationSlice[] = [];

  // Include all asset classes that have holdings or targets
  const allClasses = new Set([...classMap.keys(), ...targetMap.keys()]);

  for (const ac of allClasses) {
    const mv = classMap.get(ac) ?? 0;
    const pct = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0;
    const targetPct = targetMap.get(ac);
    const drift = targetPct !== undefined ? pct - targetPct : undefined;

    slices.push({
      assetClass: ac as AssetClass,
      label: ASSET_CLASS_LABELS[ac as AssetClass] ?? ac,
      marketValue: mv,
      percentage: Math.round(pct * 100) / 100,
      targetPct,
      drift: drift !== undefined ? Math.round(drift * 100) / 100 : undefined,
    });
  }

  // Sort by market value descending
  slices.sort((a, b) => b.marketValue - a.marketValue);

  return { slices, totalMarketValue };
}

function getPeriodStartDate(period: PerformancePeriod): Date {
  const now = new Date();
  switch (period) {
    case "1m":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3m":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6m":
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "12m":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "all":
      return new Date(2000, 0, 1);
    default:
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

export async function computePerformance(
  period: PerformancePeriod,
  accountId?: string | null,
): Promise<PerformanceResponse> {
  const prisma = getPrisma();
  const startDate = getPeriodStartDate(period);
  const endDate = new Date();

  // Get current holdings
  const where = accountId ? { accountId } : {};
  const rows = await prisma.holding.findMany({ where });
  const holdings = rows.map(decryptHolding);

  // Include savings/HYS balances for portfolio-wide queries
  let savingsBalance = 0;
  if (!accountId) {
    savingsBalance = await getCashBalance();
  }

  // Current portfolio value
  const totalValue = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0) + savingsBalance;
  const totalCost = holdings.reduce((s, h) => {
    if (h.shares != null && h.costBasis != null) return s + h.shares * h.costBasis;
    return s;
  }, 0) + savingsBalance;
  const totalReturn = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  // Build performance series from price history
  const series: PerformancePoint[] = [];
  const tickerShares = new Map<string, number>();
  for (const h of holdings) {
    if (h.ticker && h.shares != null) {
      tickerShares.set(h.ticker, (tickerShares.get(h.ticker) ?? 0) + h.shares);
    }
  }

  // Get price history for all tickers and benchmark in parallel
  const tickers = [...tickerShares.keys()];
  const [priceHistories, benchmarkHistory] = await Promise.all([
    Promise.all(tickers.map((t) => getPriceHistory(t, startDate, endDate))),
    getBenchmarkHistory("SPY", startDate, endDate),
  ]);

  const pricesByDate = new Map<string, Map<string, number>>();
  for (let i = 0; i < tickers.length; i++) {
    for (const point of priceHistories[i]) {
      const dateKey = point.date.slice(0, 10);
      if (!pricesByDate.has(dateKey)) pricesByDate.set(dateKey, new Map());
      pricesByDate.get(dateKey)!.set(tickers[i], point.price);
    }
  }
  const benchmarkByDate = new Map<string, number>();
  for (const point of benchmarkHistory) {
    benchmarkByDate.set(point.date.slice(0, 10), point.price);
  }

  // Build series from available dates
  const allDates = [...new Set([...pricesByDate.keys(), ...benchmarkByDate.keys()])].sort();

  const lastKnownPrices = new Map<string, number>();
  let firstBenchmarkPrice: number | null = null;

  for (const dateKey of allDates) {
    // Update known prices
    const dayPrices = pricesByDate.get(dateKey);
    if (dayPrices) {
      for (const [ticker, price] of dayPrices) {
        lastKnownPrices.set(ticker, price);
      }
    }

    // Compute portfolio value for this date
    let dayValue = 0;
    for (const [ticker, shares] of tickerShares) {
      const price = lastKnownPrices.get(ticker);
      if (price != null) dayValue += shares * price;
    }

    // Add holdings without tickers at their current market value
    for (const h of holdings) {
      if (!h.ticker && h.marketValue != null) {
        dayValue += h.marketValue;
      }
    }

    const benchmarkPrice = benchmarkByDate.get(dateKey);
    let benchmarkValue: number | undefined;
    if (benchmarkPrice != null) {
      if (firstBenchmarkPrice === null) firstBenchmarkPrice = benchmarkPrice;
      // Normalize benchmark to same starting value as portfolio
      if (firstBenchmarkPrice > 0 && series.length === 0 && dayValue > 0) {
        benchmarkValue = dayValue; // First point: same as portfolio
      } else if (firstBenchmarkPrice > 0) {
        const firstPortfolioValue = series[0]?.portfolioValue ?? dayValue;
        benchmarkValue = firstPortfolioValue * (benchmarkPrice / firstBenchmarkPrice);
      }
    }

    if (dayValue > 0 || benchmarkValue != null) {
      series.push({
        date: dateKey,
        portfolioValue: dayValue,
        benchmarkValue,
      });
    }
  }

  // Compute benchmark return
  let benchmarkReturnPct: number | undefined;
  if (benchmarkHistory.length >= 2) {
    const firstPrice = benchmarkHistory[0].price;
    const lastPrice = benchmarkHistory[benchmarkHistory.length - 1].price;
    if (firstPrice > 0) {
      benchmarkReturnPct = ((lastPrice - firstPrice) / firstPrice) * 100;
    }
  }

  const summary: PerformanceSummary = {
    totalValue,
    totalCost,
    totalReturn,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    benchmarkReturnPct: benchmarkReturnPct != null ? Math.round(benchmarkReturnPct * 100) / 100 : undefined,
  };

  return { summary, series, period };
}

export async function computeRebalanceSuggestions(
  accountId?: string | null,
): Promise<RebalanceResponse> {
  const allocation = await computeAssetAllocation(accountId);

  const suggestions: RebalanceSuggestion[] = [];

  for (const slice of allocation.slices) {
    if (slice.targetPct === undefined) continue;

    const drift = slice.percentage - slice.targetPct;
    let action: "buy" | "sell" | "hold";
    let amount: number;

    if (Math.abs(drift) < 1) {
      action = "hold";
      amount = 0;
    } else if (drift > 0) {
      action = "sell";
      amount = (drift / 100) * allocation.totalMarketValue;
    } else {
      action = "buy";
      amount = (Math.abs(drift) / 100) * allocation.totalMarketValue;
    }

    suggestions.push({
      assetClass: slice.assetClass,
      label: slice.label,
      currentPct: slice.percentage,
      targetPct: slice.targetPct,
      drift: Math.round(drift * 100) / 100,
      action,
      amount: Math.round(amount * 100) / 100,
    });
  }

  // Sort by absolute drift descending
  suggestions.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  return { suggestions, totalMarketValue: allocation.totalMarketValue };
}
