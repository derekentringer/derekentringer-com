import { describe, it, expect, beforeAll } from "vitest";
import { initEncryptionKey } from "../lib/encryption.js";
import {
  decryptGoal,
  encryptGoalForCreate,
  encryptGoalForUpdate,
} from "../lib/mappers.js";
import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  initEncryptionKey(TEST_KEY);
});

describe("Goal mappers", () => {
  it("encryptGoalForCreate encrypts sensitive fields", () => {
    const input = {
      name: "Emergency Fund",
      type: "savings",
      targetAmount: 10000,
      currentAmount: 2500,
      targetDate: "2027-06-01",
      priority: 1,
      accountIds: ["acc-1", "acc-2"],
      extraPayment: null,
      notes: "Build 6-month emergency fund",
    };

    const encrypted = encryptGoalForCreate(input);

    expect(encrypted.name).not.toBe("Emergency Fund");
    expect(encrypted.type).toBe("savings");
    expect(encrypted.targetAmount).not.toBe("10000");
    expect(encrypted.currentAmount).not.toBeNull();
    expect(encrypted.currentAmount).not.toBe("2500");
    expect(encrypted.targetDate).not.toBe("2027-06-01");
    expect(encrypted.targetDate).not.toBeNull();
    expect(encrypted.priority).toBe(1);
    expect(encrypted.accountIds).not.toBeNull();
    expect(encrypted.accountIds).not.toContain("acc-1");
    expect(encrypted.extraPayment).toBeNull();
    expect(encrypted.notes).not.toBe("Build 6-month emergency fund");
    expect(encrypted.notes).not.toBeNull();
  });

  it("encryptGoalForCreate handles null optional fields", () => {
    const input = {
      name: "Simple Goal",
      type: "custom",
      targetAmount: 5000,
    };

    const encrypted = encryptGoalForCreate(input);

    expect(encrypted.currentAmount).toBeNull();
    expect(encrypted.targetDate).toBeNull();
    expect(encrypted.accountIds).toBeNull();
    expect(encrypted.extraPayment).toBeNull();
    expect(encrypted.monthlyContribution).toBeNull();
    expect(encrypted.notes).toBeNull();
    expect(encrypted.priority).toBeUndefined();
  });

  it("decryptGoal round-trips with encryptGoalForCreate", () => {
    const input = {
      name: "Pay Off Credit Card",
      type: "debt_payoff",
      targetAmount: 8000,
      currentAmount: 3200,
      targetDate: "2026-12-31",
      priority: 2,
      accountIds: ["debt-1", "debt-2"],
      extraPayment: 200,
      notes: "Focus on high-interest card first",
    };

    const encrypted = encryptGoalForCreate(input);
    const now = new Date();

    const row = {
      id: "goal-123",
      ...encrypted,
      priority: encrypted.priority ?? 0,
      isActive: true,
      isCompleted: false,
      completedAt: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptGoal(row);

    expect(decrypted.id).toBe("goal-123");
    expect(decrypted.name).toBe("Pay Off Credit Card");
    expect(decrypted.type).toBe("debt_payoff");
    expect(decrypted.targetAmount).toBe(8000);
    expect(decrypted.currentAmount).toBe(3200);
    expect(decrypted.targetDate).toBe("2026-12-31");
    expect(decrypted.priority).toBe(2);
    expect(decrypted.accountIds).toEqual(["debt-1", "debt-2"]);
    expect(decrypted.extraPayment).toBe(200);
    expect(decrypted.notes).toBe("Focus on high-interest card first");
    expect(decrypted.isActive).toBe(true);
    expect(decrypted.isCompleted).toBe(false);
    expect(decrypted.completedAt).toBeUndefined();
    expect(decrypted.sortOrder).toBe(0);
    expect(decrypted.createdAt).toBe(now.toISOString());
    expect(decrypted.updatedAt).toBe(now.toISOString());
  });

  it("decryptGoal handles null optional fields", () => {
    const input = {
      name: "Net Worth Goal",
      type: "net_worth",
      targetAmount: 100000,
    };

    const encrypted = encryptGoalForCreate(input);
    const now = new Date();

    const row = {
      id: "goal-456",
      ...encrypted,
      priority: encrypted.priority ?? 0,
      isActive: true,
      isCompleted: false,
      completedAt: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptGoal(row);

    expect(decrypted.currentAmount).toBeUndefined();
    expect(decrypted.targetDate).toBeUndefined();
    expect(decrypted.accountIds).toBeUndefined();
    expect(decrypted.extraPayment).toBeUndefined();
    expect(decrypted.notes).toBeUndefined();
  });

  it("decryptGoal handles completedAt date", () => {
    const input = {
      name: "Completed Goal",
      type: "savings",
      targetAmount: 1000,
    };

    const encrypted = encryptGoalForCreate(input);
    const now = new Date();
    const completedDate = new Date("2026-01-15T10:30:00Z");

    const row = {
      id: "goal-789",
      ...encrypted,
      priority: encrypted.priority ?? 0,
      isActive: false,
      isCompleted: true,
      completedAt: completedDate,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptGoal(row);

    expect(decrypted.isCompleted).toBe(true);
    expect(decrypted.completedAt).toBe(completedDate.toISOString());
  });

  it("encryptGoalForUpdate only includes provided fields", () => {
    const data = encryptGoalForUpdate({
      name: "Updated Name",
      targetAmount: 15000,
    });

    expect(data.name).toBeDefined();
    expect(data.name).not.toBe("Updated Name");
    expect(data.targetAmount).toBeDefined();
    expect(data.type).toBeUndefined();
    expect(data.currentAmount).toBeUndefined();
    expect(data.targetDate).toBeUndefined();
    expect(data.priority).toBeUndefined();
    expect(data.accountIds).toBeUndefined();
    expect(data.extraPayment).toBeUndefined();
    expect(data.notes).toBeUndefined();
    expect(data.isActive).toBeUndefined();
    expect(data.isCompleted).toBeUndefined();
    expect(data.completedAt).toBeUndefined();
  });

  it("encryptGoalForUpdate handles null values for nullable fields", () => {
    const data = encryptGoalForUpdate({
      currentAmount: null,
      targetDate: null,
      accountIds: null,
      extraPayment: null,
      notes: null,
    });

    expect(data.currentAmount).toBeNull();
    expect(data.targetDate).toBeNull();
    expect(data.accountIds).toBeNull();
    expect(data.extraPayment).toBeNull();
    expect(data.notes).toBeNull();
  });

  it("encryptGoalForUpdate sets completedAt when isCompleted changes", () => {
    const data = encryptGoalForUpdate({ isCompleted: true });

    expect(data.isCompleted).toBe(true);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("encryptGoalForUpdate clears completedAt when isCompleted set to false", () => {
    const data = encryptGoalForUpdate({ isCompleted: false });

    expect(data.isCompleted).toBe(false);
    expect(data.completedAt).toBeNull();
  });

  it("encryptGoalForUpdate handles empty accountIds array as null", () => {
    const data = encryptGoalForUpdate({ accountIds: [] });

    expect(data.accountIds).toBeNull();
  });

  it("encryptGoalForCreate handles empty accountIds array as null", () => {
    const input = {
      name: "Test",
      type: "savings",
      targetAmount: 1000,
      accountIds: [],
    };

    const encrypted = encryptGoalForCreate(input);
    expect(encrypted.accountIds).toBeNull();
  });

  it("encryptGoalForCreate encrypts monthlyContribution", () => {
    const input = {
      name: "Savings Goal",
      type: "savings",
      targetAmount: 10000,
      monthlyContribution: 500,
    };

    const encrypted = encryptGoalForCreate(input);
    expect(encrypted.monthlyContribution).not.toBeNull();
    expect(encrypted.monthlyContribution).not.toBe("500");
  });

  it("decryptGoal round-trips monthlyContribution", () => {
    const input = {
      name: "Custom Goal",
      type: "custom",
      targetAmount: 5000,
      monthlyContribution: 250,
    };

    const encrypted = encryptGoalForCreate(input);
    const now = new Date();

    const row = {
      id: "goal-mc",
      ...encrypted,
      priority: encrypted.priority ?? 0,
      isActive: true,
      isCompleted: false,
      completedAt: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptGoal(row);
    expect(decrypted.monthlyContribution).toBe(250);
  });

  it("encryptGoalForUpdate handles monthlyContribution", () => {
    const data = encryptGoalForUpdate({ monthlyContribution: 300 });
    expect(data.monthlyContribution).toBeDefined();
    expect(data.monthlyContribution).not.toBe("300");
  });

  it("encryptGoalForUpdate clears monthlyContribution with null", () => {
    const data = encryptGoalForUpdate({ monthlyContribution: null });
    expect(data.monthlyContribution).toBeNull();
  });
});
