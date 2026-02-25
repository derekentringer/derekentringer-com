import { getPrisma } from "../lib/prisma.js";
import { decryptPriceHistory } from "../lib/mappers.js";
import { encryptNumber, decryptNumber } from "../lib/encryption.js";

export async function upsertPriceHistory(
  ticker: string,
  price: number,
  date: Date,
  source: string,
): Promise<void> {
  const prisma = getPrisma();
  const encryptedPrice = encryptNumber(price);

  await prisma.priceHistory.upsert({
    where: {
      ticker_date: { ticker, date },
    },
    update: { price: encryptedPrice },
    create: {
      ticker,
      price: encryptedPrice,
      date,
      source,
    },
  });
}

export async function getPriceHistory(
  ticker: string,
  startDate: Date,
  endDate: Date,
): Promise<Array<{ id: string; ticker: string; price: number; date: string; source: string }>> {
  const prisma = getPrisma();
  const rows = await prisma.priceHistory.findMany({
    where: {
      ticker,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: "asc" },
  });
  return rows.map(decryptPriceHistory);
}

export async function upsertBenchmarkHistory(
  symbol: string,
  price: number,
  date: Date,
): Promise<void> {
  const prisma = getPrisma();
  const encryptedPrice = encryptNumber(price);

  await prisma.benchmarkHistory.upsert({
    where: {
      symbol_date: { symbol, date },
    },
    update: { price: encryptedPrice },
    create: {
      symbol,
      price: encryptedPrice,
      date,
    },
  });
}

export async function getBenchmarkHistory(
  symbol: string,
  startDate: Date,
  endDate: Date,
): Promise<Array<{ date: string; price: number }>> {
  const prisma = getPrisma();
  const rows = await prisma.benchmarkHistory.findMany({
    where: {
      symbol,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: "asc" },
  });
  return rows.map((row) => ({
    date: row.date.toISOString(),
    price: decryptNumber(row.price),
  }));
}
