import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { initEncryptionKey } from "../lib/encryption.js";
import { createMockPrisma } from "./helpers/mockPrisma.js";
import type { MockPrisma } from "./helpers/mockPrisma.js";
import { encryptGoalForCreate } from "../lib/mappers.js";

let mockPrisma: MockPrisma;

beforeAll(() => {
  initEncryptionKey(process.env.ENCRYPTION_KEY!);
  mockPrisma = createMockPrisma();
});

import {
  createGoal,
  getGoal,
  listGoals,
  updateGoal,
  deleteGoal,
  reorderGoals,
} from "../store/goalStore.js";

const TEST_USER_ID = "test-user-1";

function makeMockRow(overrides: Record<string, unknown> = {}) {
  const encrypted = encryptGoalForCreate({
    name: "Test Goal",
    type: "savings",
    targetAmount: 5000,
  });
  return {
    id: "goal-1",
    userId: TEST_USER_ID,
    ...encrypted,
    isActive: true,
    isCompleted: false,
    completedAt: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}


describe("goalStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (client: MockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
  });

  describe("createGoal", () => {
    it("encrypts data and returns decrypted goal", async () => {
      mockPrisma.goal.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.goal.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "goal-new",
          ...args.data,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await createGoal(TEST_USER_ID, {
        name: "Emergency Fund",
        type: "savings",
        targetAmount: 10000,
        priority: 1,
      });

      expect(result.id).toBe("goal-new");
      expect(result.name).toBe("Emergency Fund");
      expect(result.type).toBe("savings");
      expect(result.targetAmount).toBe(10000);
      expect(result.isActive).toBe(true);
      expect(result.sortOrder).toBe(3); // max(2) + 1
      expect(mockPrisma.goal.create).toHaveBeenCalledTimes(1);
    });

    it("assigns sortOrder 0 when no goals exist", async () => {
      mockPrisma.goal.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.goal.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: "goal-first",
          ...args.data,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: args.data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await createGoal(TEST_USER_ID, {
        name: "First Goal",
        type: "custom",
        targetAmount: 1000,
      });

      expect(result.sortOrder).toBe(0);
    });
  });

  describe("getGoal", () => {
    it("returns decrypted goal when found", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(makeMockRow());

      const result = await getGoal(TEST_USER_ID, "goal-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Goal");
      expect(result!.targetAmount).toBe(5000);
      expect(result!.type).toBe("savings");
    });

    it("returns null when not found", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(null);

      const result = await getGoal(TEST_USER_ID, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listGoals", () => {
    it("returns all goals ordered by sortOrder", async () => {
      const encA = encryptGoalForCreate({
        name: "Goal A",
        type: "savings",
        targetAmount: 1000,
      });
      const encB = encryptGoalForCreate({
        name: "Goal B",
        type: "debt_payoff",
        targetAmount: 2000,
      });

      mockPrisma.goal.findMany.mockResolvedValue([
        {
          id: "goal-a",
          ...encA,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "goal-b",
          ...encB,
          isActive: true,
          isCompleted: false,
          completedAt: null,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listGoals(TEST_USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Goal A");
      expect(result[1].name).toBe("Goal B");
      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("filters by isActive", async () => {
      mockPrisma.goal.findMany.mockResolvedValue([]);

      await listGoals(TEST_USER_ID, { isActive: true });

      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("filters by type", async () => {
      mockPrisma.goal.findMany.mockResolvedValue([]);

      await listGoals(TEST_USER_ID, { type: "debt_payoff" });

      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, type: "debt_payoff" },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("filters by both isActive and type", async () => {
      mockPrisma.goal.findMany.mockResolvedValue([]);

      await listGoals(TEST_USER_ID, { isActive: true, type: "savings" });

      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, isActive: true, type: "savings" },
        orderBy: { sortOrder: "asc" },
      });
    });
  });

  describe("updateGoal", () => {
    it("updates and returns decrypted goal", async () => {
      const row = makeMockRow();
      mockPrisma.goal.findUnique.mockResolvedValue(row);
      mockPrisma.goal.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...row,
          ...args.data,
          updatedAt: new Date(),
        }),
      );

      const result = await updateGoal(TEST_USER_ID, "goal-1", { name: "Updated Goal" });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Updated Goal");
    });

    it("returns null when goal not found", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(null);

      const result = await updateGoal(TEST_USER_ID, "nonexistent", { name: "Nope" });
      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(makeMockRow());
      mockPrisma.goal.update.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        updateGoal(TEST_USER_ID, "goal-1", { name: "Fail" }),
      ).rejects.toThrow("DB connection failed");
    });
  });

  describe("deleteGoal", () => {
    it("returns true when deleted", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(makeMockRow());
      mockPrisma.goal.delete.mockResolvedValue({});

      const result = await deleteGoal(TEST_USER_ID, "goal-1");
      expect(result).toBe(true);
    });

    it("returns false when not found", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(null);

      const result = await deleteGoal(TEST_USER_ID, "nonexistent");
      expect(result).toBe(false);
    });

    it("re-throws non-P2025 errors", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(makeMockRow());
      mockPrisma.goal.delete.mockRejectedValue(new Error("DB connection failed"));

      await expect(deleteGoal(TEST_USER_ID, "goal-1")).rejects.toThrow("DB connection failed");
    });
  });

  describe("reorderGoals", () => {
    it("calls $transaction with update operations", async () => {
      // For batch transactions (array of promises), mock differently
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.goal.update.mockResolvedValue({});

      await reorderGoals(TEST_USER_ID, [
        { id: "goal-a", sortOrder: 1 },
        { id: "goal-b", sortOrder: 0 },
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
