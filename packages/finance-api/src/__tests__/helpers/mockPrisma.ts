import { vi } from "vitest";
import { setPrisma } from "../../lib/prisma.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export function createMockPrisma() {
  const mock = {
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    balance: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
  } as unknown as PrismaClient;

  // Interactive transaction: pass mock itself as the tx client
  (mock as any).$transaction.mockImplementation(async (fn: any) => fn(mock));

  setPrisma(mock);
  return mock;
}
