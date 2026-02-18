import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const isProduction = (process.env.NODE_ENV || "").toLowerCase().trim() === "production";
    const adapter = new PrismaPg({
      connectionString,
      max: 10,
      ...(isProduction ? { ssl: { rejectUnauthorized: true } } : {}),
    });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export function setPrisma(client: PrismaClient): void {
  prisma = client;
}

export type { PrismaClient };
