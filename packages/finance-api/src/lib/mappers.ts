import type {
  Account as PrismaAccount,
  Transaction as PrismaTransaction,
  Balance as PrismaBalance,
} from "../generated/prisma/client.js";
import type {
  Account,
  Transaction,
  Balance,
} from "@derekentringer/shared";
import { AccountType } from "@derekentringer/shared";
import {
  encryptField,
  decryptField,
  encryptNumber,
  decryptNumber,
  encryptOptionalField,
  decryptOptionalField,
} from "./encryption.js";

// --- Account ---

export function decryptAccount(row: PrismaAccount): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    institution: row.institution,
    accountNumber: decryptOptionalField(row.accountNumber),
    currentBalance: decryptNumber(row.currentBalance),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptAccountForCreate(input: {
  name: string;
  type: AccountType;
  institution: string;
  accountNumber?: string | null;
  currentBalance: number;
}): {
  name: string;
  type: string;
  institution: string;
  accountNumber: string | null;
  currentBalance: string;
} {
  return {
    name: input.name,
    type: input.type,
    institution: input.institution,
    accountNumber: encryptOptionalField(input.accountNumber),
    currentBalance: encryptNumber(input.currentBalance),
  };
}

// --- Transaction ---

export function decryptTransaction(row: PrismaTransaction): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date.toISOString(),
    description: row.description,
    amount: decryptNumber(row.amount),
    category: row.category ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptTransactionForCreate(input: {
  accountId: string;
  date: Date;
  description: string;
  amount: number;
  category?: string | null;
  notes?: string | null;
}): {
  accountId: string;
  date: Date;
  description: string;
  amount: string;
  category: string | null;
  notes: string | null;
} {
  return {
    accountId: input.accountId,
    date: input.date,
    description: input.description,
    amount: encryptNumber(input.amount),
    category: input.category ?? null,
    notes: input.notes ?? null,
  };
}

// --- Balance ---

export function decryptBalance(row: PrismaBalance): Balance {
  return {
    accountId: row.accountId,
    balance: decryptNumber(row.balance),
    date: row.date.toISOString(),
  };
}

export function encryptBalanceForCreate(input: {
  accountId: string;
  balance: number;
  date: Date;
}): {
  accountId: string;
  balance: string;
  date: Date;
} {
  return {
    accountId: input.accountId,
    balance: encryptNumber(input.balance),
    date: input.date,
  };
}
