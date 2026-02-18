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
  encryptOptionalNumber,
  decryptOptionalNumber,
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
    interestRate: decryptOptionalNumber(row.interestRate),
    csvParserId: row.csvParserId ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface EncryptedAccountCreate {
  name: string;
  type: string;
  institution: string;
  accountNumber: string | null;
  currentBalance: string;
  interestRate: string | null;
  csvParserId: string | null;
  isActive?: boolean;
}

export function encryptAccountForCreate(input: {
  name: string;
  type: AccountType;
  institution: string;
  accountNumber?: string | null;
  currentBalance: number;
  interestRate?: number | null;
  csvParserId?: string | null;
  isActive?: boolean;
}): EncryptedAccountCreate {
  const data: EncryptedAccountCreate = {
    name: input.name,
    type: input.type,
    institution: input.institution,
    accountNumber: encryptOptionalField(input.accountNumber),
    currentBalance: encryptNumber(input.currentBalance),
    interestRate: encryptOptionalNumber(input.interestRate),
    csvParserId: input.csvParserId ?? null,
  };
  // Only set isActive when explicitly provided; otherwise Prisma @default(true) applies
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

export interface EncryptedAccountUpdate {
  name?: string;
  type?: string;
  institution?: string;
  accountNumber?: string | null;
  currentBalance?: string;
  interestRate?: string | null;
  csvParserId?: string | null;
  isActive?: boolean;
}

export function encryptAccountForUpdate(input: {
  name?: string;
  type?: AccountType;
  institution?: string;
  accountNumber?: string | null;
  currentBalance?: number;
  interestRate?: number | null;
  csvParserId?: string | null;
  isActive?: boolean;
}): EncryptedAccountUpdate {
  const data: EncryptedAccountUpdate = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.institution !== undefined) data.institution = input.institution;
  if (input.accountNumber !== undefined)
    data.accountNumber = encryptOptionalField(input.accountNumber);
  if (input.currentBalance !== undefined)
    data.currentBalance = encryptNumber(input.currentBalance);
  if (input.interestRate !== undefined)
    data.interestRate = encryptOptionalNumber(input.interestRate);
  if (input.csvParserId !== undefined)
    data.csvParserId = input.csvParserId;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return data;
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
