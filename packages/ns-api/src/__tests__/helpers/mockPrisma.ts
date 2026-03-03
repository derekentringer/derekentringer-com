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
  updateMany: Mock;
  delete: Mock;
  deleteMany: Mock;
  count: Mock;
  aggregate: Mock;
  groupBy: Mock;
  upsert: Mock;
}

export interface MockPrisma {
  note: MockModel;
  folder: MockModel;
  syncCursor: MockModel;
  refreshToken: MockModel;
  $disconnect: Mock;
  $transaction: Mock;
  $queryRawUnsafe: Mock;
}

function createMockModel(): MockModel {
  return {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    upsert: vi.fn(),
  };
}

export function createMockPrisma(): MockPrisma {
  const mock: MockPrisma = {
    note: createMockModel(),
    folder: createMockModel(),
    syncCursor: createMockModel(),
    refreshToken: createMockModel(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  };

  mock.$transaction.mockImplementation(
    async (input: unknown) => {
      if (typeof input === "function") {
        return (input as (client: MockPrisma) => Promise<unknown>)(mock);
      }
      // Array of promises (batch transaction)
      return Promise.all(input as Promise<unknown>[]);
    },
  );

  setPrisma(mock as unknown as PrismaClient);
  return mock;
}
