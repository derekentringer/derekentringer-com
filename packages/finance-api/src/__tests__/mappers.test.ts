import { describe, it, expect, beforeAll } from "vitest";
import { initEncryptionKey, encryptNumber, encryptField, encryptOptionalField } from "../lib/encryption.js";
import {
  decryptAccount,
  encryptAccountForCreate,
  decryptTransaction,
  encryptTransactionForCreate,
  decryptBalance,
  encryptBalanceForCreate,
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
    };

    const encrypted = encryptAccountForCreate(input);

    expect(encrypted.name).toBe("Checking");
    expect(encrypted.type).toBe("checking");
    expect(encrypted.institution).toBe("Chase");
    expect(encrypted.accountNumber).not.toBe("1234");
    expect(encrypted.accountNumber).not.toBeNull();
    expect(encrypted.currentBalance).not.toBe("5000.5");
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
  });

  it("decryptAccount round-trips with encryptAccountForCreate", () => {
    const input = {
      name: "Checking",
      type: AccountType.Checking,
      institution: "Chase",
      accountNumber: "1234",
      currentBalance: 5000.5,
    };

    const encrypted = encryptAccountForCreate(input);
    const now = new Date();

    const row = {
      id: "cuid-123",
      ...encrypted,
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
    expect(decrypted.createdAt).toBe(now.toISOString());
    expect(decrypted.updatedAt).toBe(now.toISOString());
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
    expect(encrypted.description).toBe("Coffee");
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

    const row = {
      id: "bal-123",
      ...encrypted,
    };

    const decrypted = decryptBalance(row);

    expect(decrypted.accountId).toBe("acc-1");
    expect(decrypted.balance).toBe(10000.0);
  });
});
