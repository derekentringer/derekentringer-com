import { vi } from "vitest";
import type { Mock } from "vitest";
import { setPrisma } from "../../lib/prisma.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface MockModel {
  create: Mock;
  findUnique: Mock;
  findMany: Mock;
  update: Mock;
  delete: Mock;
  deleteMany: Mock;
}

export interface MockPrisma {
  refreshToken: MockModel;
  account: MockModel;
  transaction: MockModel;
  balance: Omit<MockModel, "update">;
  $disconnect: Mock;
  $transaction: Mock;
}

export function createMockPrisma(): MockPrisma {
  const mock: MockPrisma = {
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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
  };

  // Interactive transaction: pass mock itself as the tx client
  mock.$transaction.mockImplementation(
    async (fn: (client: MockPrisma) => Promise<unknown>) => fn(mock),
  );

  setPrisma(mock as unknown as PrismaClient);
  return mock;
}
