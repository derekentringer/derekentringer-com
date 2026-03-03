import { vi } from "vitest";
import type { Mock } from "vitest";
import { setPrisma } from "../../lib/prisma.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface MockModel {
  create: Mock;
  createMany: Mock;
  findUnique: Mock;
  findMany: Mock;
  update: Mock;
  delete: Mock;
  deleteMany: Mock;
  count: Mock;
  aggregate: Mock;
  upsert: Mock;
}

export interface MockPrisma {
  refreshToken: MockModel;
  account: MockModel;
  transaction: MockModel;
  balance: Omit<MockModel, "update">;
  category: MockModel;
  categoryRule: MockModel;
  goal: MockModel;
  holding: MockModel;
  targetAllocation: MockModel;
  priceHistory: MockModel;
  benchmarkHistory: MockModel;
  $disconnect: Mock;
  $transaction: Mock;
}

function createMockModel(): MockModel {
  return {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    upsert: vi.fn(),
  };
}

export function createMockPrisma(): MockPrisma {
  const mock: MockPrisma = {
    refreshToken: createMockModel(),
    account: createMockModel(),
    transaction: createMockModel(),
    balance: createMockModel(),
    category: createMockModel(),
    categoryRule: createMockModel(),
    goal: createMockModel(),
    holding: createMockModel(),
    targetAllocation: createMockModel(),
    priceHistory: createMockModel(),
    benchmarkHistory: createMockModel(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
  };

  // Interactive transaction: pass mock itself as the tx client
  mock.$transaction.mockImplementation(
    async (fn: (client: MockPrisma) => Promise<unknown>) => fn(mock),
  );

  setPrisma(mock as unknown as PrismaClient);
  return mock;
}
