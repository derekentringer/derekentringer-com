import { describe, it, expect, beforeAll } from "vitest";
import { initEncryptionKey } from "../lib/encryption.js";
import {
  decryptAccount,
  encryptAccountForCreate,
  encryptAccountForUpdate,
  decryptTransaction,
  encryptTransactionForCreate,
  decryptBalance,
  encryptBalanceForCreate,
  encryptCreditProfileForCreate,
  decryptCreditProfile,
} from "../lib/mappers.js";
import { AccountType } from "@derekentringer/shared";
import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  initEncryptionKey(TEST_KEY);
});

describe("Account mappers", () => {
  it("encryptAccountForCreate encrypts sensitive fields", () => {
    const input = {
      name: "Checking",
      type: AccountType.Checking,
      institution: "Chase",
      accountNumber: "1234",
      currentBalance: 5000.5,
      interestRate: 4.5,
      isActive: true,
    };

    const encrypted = encryptAccountForCreate(input);

    expect(encrypted.name).not.toBe("Checking");
    expect(encrypted.type).toBe("checking");
    expect(encrypted.institution).not.toBe("Chase");
    expect(encrypted.accountNumber).not.toBe("1234");
    expect(encrypted.accountNumber).not.toBeNull();
    expect(encrypted.currentBalance).not.toBe("5000.5");
    expect(encrypted.interestRate).not.toBe("4.5");
    expect(encrypted.interestRate).not.toBeNull();
    expect(encrypted.isActive).toBe(true);
  });

  it("encryptAccountForCreate handles null accountNumber", () => {
    const input = {
      name: "Savings",
      type: AccountType.Savings,
      institution: "Bank",
      accountNumber: null,
      currentBalance: 100,
    };

    const encrypted = encryptAccountForCreate(input);
    expect(encrypted.accountNumber).toBeNull();
    expect(encrypted.interestRate).toBeNull();
    expect(encrypted.csvParserId).toBeNull();
    // isActive omitted — Prisma @default(true) applies
    expect(encrypted.isActive).toBeUndefined();
  });

  it("decryptAccount round-trips with encryptAccountForCreate", () => {
    const input = {
      name: "Checking",
      type: AccountType.Checking,
      institution: "Chase",
      accountNumber: "1234",
      currentBalance: 5000.5,
      interestRate: 4.5,
      csvParserId: "chase-checking",
      isActive: true,
    };

    const encrypted = encryptAccountForCreate(input);
    const now = new Date();

    const row = {
      id: "cuid-123",
      ...encrypted,
      isActive: encrypted.isActive ?? true,
      isFavorite: encrypted.isFavorite ?? false,
      excludeFromIncomeSources: encrypted.excludeFromIncomeSources ?? false,
      dtiPercentage: encrypted.dtiPercentage ?? 100,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptAccount(row);

    expect(decrypted.id).toBe("cuid-123");
    expect(decrypted.name).toBe("Checking");
    expect(decrypted.type).toBe(AccountType.Checking);
    expect(decrypted.institution).toBe("Chase");
    expect(decrypted.accountNumber).toBe("1234");
    expect(decrypted.currentBalance).toBe(5000.5);
    expect(decrypted.interestRate).toBe(4.5);
    expect(decrypted.csvParserId).toBe("chase-checking");
    expect(decrypted.isActive).toBe(true);
    expect(decrypted.sortOrder).toBe(0);
    expect(decrypted.createdAt).toBe(now.toISOString());
    expect(decrypted.updatedAt).toBe(now.toISOString());
  });

  it("decryptAccount handles null optional fields", () => {
    const input = {
      name: "Savings",
      type: AccountType.Savings,
      institution: "Bank",
      currentBalance: 100,
    };

    const encrypted = encryptAccountForCreate(input);
    const now = new Date();

    const row = {
      id: "cuid-456",
      ...encrypted,
      isActive: true, // Prisma @default(true) provides this
      isFavorite: false,
      excludeFromIncomeSources: false,
      dtiPercentage: 100,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptAccount(row);

    expect(decrypted.interestRate).toBeUndefined();
    expect(decrypted.csvParserId).toBeUndefined();
    expect(decrypted.isActive).toBe(true);
  });

  it("decryptAccount preserves excludeFromIncomeSources=true", () => {
    const input = {
      name: "Checking",
      type: AccountType.Checking,
      institution: "Chase",
      currentBalance: 1000,
      excludeFromIncomeSources: true,
    };

    const encrypted = encryptAccountForCreate(input);
    const now = new Date();

    const row = {
      id: "cuid-789",
      ...encrypted,
      isActive: encrypted.isActive ?? true,
      isFavorite: encrypted.isFavorite ?? false,
      excludeFromIncomeSources: encrypted.excludeFromIncomeSources ?? false,
      dtiPercentage: encrypted.dtiPercentage ?? 100,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptAccount(row);

    expect(decrypted.excludeFromIncomeSources).toBe(true);
  });

  it("encryptAccountForUpdate only includes provided fields", () => {
    const data = encryptAccountForUpdate({
      name: "Updated Name",
      currentBalance: 9999,
    });

    expect(data.name).toBeDefined();
    expect(data.name).not.toBe("Updated Name");
    expect(data.currentBalance).toBeDefined();
    expect(data.type).toBeUndefined();
    expect(data.institution).toBeUndefined();
    expect(data.accountNumber).toBeUndefined();
    expect(data.interestRate).toBeUndefined();
  });

  it("encryptAccountForUpdate handles null values for optional fields", () => {
    const data = encryptAccountForUpdate({
      accountNumber: null,
      interestRate: null,
      csvParserId: null,
    });

    expect(data.accountNumber).toBeNull();
    expect(data.interestRate).toBeNull();
    expect(data.csvParserId).toBeNull();
  });
});

describe("Transaction mappers", () => {
  it("encryptTransactionForCreate encrypts amount", () => {
    const date = new Date("2024-01-15");
    const input = {
      accountId: "acc-1",
      date,
      description: "Coffee",
      amount: -4.5,
      category: "Food",
      notes: null,
    };

    const encrypted = encryptTransactionForCreate(input);

    expect(encrypted.accountId).toBe("acc-1");
    expect(encrypted.date).toBe(date);
    expect(encrypted.description).not.toBe("Coffee");
    expect(encrypted.amount).not.toBe("-4.5");
    expect(encrypted.category).toBe("Food");
    expect(encrypted.notes).toBeNull();
  });

  it("decryptTransaction round-trips with encryptTransactionForCreate", () => {
    const date = new Date("2024-01-15");
    const input = {
      accountId: "acc-1",
      date,
      description: "Coffee",
      amount: -4.5,
      category: "Food",
      notes: "Morning coffee",
    };

    const encrypted = encryptTransactionForCreate(input);
    const now = new Date();

    const row = {
      id: "txn-123",
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptTransaction(row);

    expect(decrypted.id).toBe("txn-123");
    expect(decrypted.accountId).toBe("acc-1");
    expect(decrypted.description).toBe("Coffee");
    expect(decrypted.amount).toBe(-4.5);
    expect(decrypted.category).toBe("Food");
    expect(decrypted.notes).toBe("Morning coffee");
  });
});

describe("Balance mappers", () => {
  it("encryptBalanceForCreate encrypts balance", () => {
    const date = new Date("2024-01-15");
    const input = {
      accountId: "acc-1",
      balance: 10000.0,
      date,
    };

    const encrypted = encryptBalanceForCreate(input);

    expect(encrypted.accountId).toBe("acc-1");
    expect(encrypted.date).toBe(date);
    expect(encrypted.balance).not.toBe("10000");
  });

  it("decryptBalance round-trips with encryptBalanceForCreate", () => {
    const date = new Date("2024-01-15");
    const input = {
      accountId: "acc-1",
      balance: 10000.0,
      date,
    };

    const encrypted = encryptBalanceForCreate(input);

    const now = new Date();
    const row = {
      id: "bal-123",
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptBalance(row);

    expect(decrypted.accountId).toBe("acc-1");
    expect(decrypted.balance).toBe(10000.0);
  });
});

describe("Credit profile mappers", () => {
  it("encryptCreditProfileForCreate / decryptCreditProfile round-trip", () => {
    const data = {
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      apr: 24.99,
      minimumPayment: 35.0,
      creditLimit: 10000,
      availableCredit: 7500.5,
      interestCharged: 42.15,
      feesCharged: 0,
      rewardsEarned: 12.34,
      paymentDueDate: "2026-02-25",
    };

    const encrypted = encryptCreditProfileForCreate("bal-123", data);

    expect(encrypted.balanceId).toBe("bal-123");
    // All values should be encrypted (not plaintext)
    expect(encrypted.apr).not.toBe("24.99");
    expect(encrypted.minimumPayment).not.toBe("35");
    expect(encrypted.creditLimit).not.toBe("10000");

    const now = new Date();
    const row = {
      id: "cp-123",
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptCreditProfile(row);

    expect(decrypted.periodStart).toBe("2026-01-01");
    expect(decrypted.periodEnd).toBe("2026-01-31");
    expect(decrypted.apr).toBe(24.99);
    expect(decrypted.minimumPayment).toBe(35.0);
    expect(decrypted.creditLimit).toBe(10000);
    expect(decrypted.availableCredit).toBe(7500.5);
    expect(decrypted.interestCharged).toBe(42.15);
    expect(decrypted.feesCharged).toBe(0);
    expect(decrypted.rewardsEarned).toBe(12.34);
    expect(decrypted.paymentDueDate).toBe("2026-02-25");
  });

  it("handles undefined/null fields gracefully", () => {
    const data = {
      apr: 19.99,
      minimumPayment: 25.0,
    };

    const encrypted = encryptCreditProfileForCreate("bal-456", data);

    expect(encrypted.periodStart).toBeNull();
    expect(encrypted.creditLimit).toBeNull();
    expect(encrypted.apr).not.toBeNull();

    const now = new Date();
    const row = {
      id: "cp-456",
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    const decrypted = decryptCreditProfile(row);

    expect(decrypted.periodStart).toBeUndefined();
    expect(decrypted.creditLimit).toBeUndefined();
    expect(decrypted.apr).toBe(19.99);
    expect(decrypted.minimumPayment).toBe(25.0);
  });
});
