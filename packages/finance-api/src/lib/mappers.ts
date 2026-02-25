import type {
  Account as PrismaAccount,
  Transaction as PrismaTransaction,
  Balance as PrismaBalance,
  LoanProfile as PrismaLoanProfile,
  InvestmentProfile as PrismaInvestmentProfile,
  SavingsProfile as PrismaSavingsProfile,
  CreditProfile as PrismaCreditProfile,
  Budget as PrismaBudget,
  Bill as PrismaBill,
  BillPayment as PrismaBillPayment,
  IncomeSource as PrismaIncomeSource,
  DeviceToken as PrismaDeviceToken,
  NotificationPreference as PrismaNotificationPreference,
  NotificationLog as PrismaNotificationLog,
  Goal as PrismaGoal,
  Holding as PrismaHolding,
  TargetAllocation as PrismaTargetAllocation,
  PriceHistory as PrismaPriceHistory,
} from "../generated/prisma/client.js";
import type {
  Account,
  Transaction,
  Balance,
  LoanProfileData,
  InvestmentProfileData,
  SavingsProfileData,
  CreditProfileData,
  LoanStaticData,
  LoanType,
  Budget,
  Bill,
  BillPayment,
  BillFrequency,
  IncomeSource,
  IncomeSourceFrequency,
  DeviceToken,
  NotificationPreference,
  NotificationLogEntry,
  NotificationConfig,
  DevicePlatform,
  Goal,
  GoalType,
  Holding,
  AssetClass,
  TargetAllocation,
} from "@derekentringer/shared";
import { AccountType, NotificationType, DEFAULT_NOTIFICATION_CONFIGS } from "@derekentringer/shared";
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
    name: decryptField(row.name),
    type: row.type as AccountType,
    institution: decryptField(row.institution),
    accountNumber: decryptOptionalField(row.accountNumber),
    currentBalance: decryptNumber(row.currentBalance),
    estimatedValue: decryptOptionalNumber(row.estimatedValue),
    interestRate: decryptOptionalNumber(row.interestRate),
    csvParserId: row.csvParserId ?? undefined,
    originalBalance: decryptOptionalNumber(row.originalBalance),
    originationDate: decryptOptionalField(row.originationDate),
    maturityDate: decryptOptionalField(row.maturityDate),
    loanType: decryptOptionalField(row.loanType) as LoanType | undefined,
    employerName: decryptOptionalField(row.employerName),
    isActive: row.isActive,
    isFavorite: row.isFavorite,
    excludeFromIncomeSources: row.excludeFromIncomeSources,
    dtiPercentage: row.dtiPercentage,
    sortOrder: row.sortOrder,
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
  estimatedValue: string | null;
  interestRate: string | null;
  csvParserId: string | null;
  originalBalance: string | null;
  originationDate: string | null;
  maturityDate: string | null;
  loanType: string | null;
  employerName: string | null;
  isActive?: boolean;
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
}

export function encryptAccountForCreate(input: {
  name: string;
  type: AccountType;
  institution?: string;
  accountNumber?: string | null;
  currentBalance?: number;
  estimatedValue?: number | null;
  interestRate?: number | null;
  csvParserId?: string | null;
  originalBalance?: number | null;
  originationDate?: string | null;
  maturityDate?: string | null;
  loanType?: string | null;
  employerName?: string | null;
  isActive?: boolean;
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
}): EncryptedAccountCreate {
  const data: EncryptedAccountCreate = {
    name: encryptField(input.name),
    type: input.type,
    institution: encryptField(input.institution ?? ""),
    accountNumber: encryptOptionalField(input.accountNumber),
    currentBalance: encryptNumber(input.currentBalance ?? 0),
    estimatedValue: encryptOptionalNumber(input.estimatedValue),
    interestRate: encryptOptionalNumber(input.interestRate),
    csvParserId: input.csvParserId ?? null,
    originalBalance: encryptOptionalNumber(input.originalBalance),
    originationDate: encryptOptionalField(input.originationDate),
    maturityDate: encryptOptionalField(input.maturityDate),
    loanType: encryptOptionalField(input.loanType),
    employerName: encryptOptionalField(input.employerName),
  };
  // Only set isActive when explicitly provided; otherwise Prisma @default(true) applies
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.isFavorite !== undefined) data.isFavorite = input.isFavorite;
  if (input.excludeFromIncomeSources !== undefined) data.excludeFromIncomeSources = input.excludeFromIncomeSources;
  if (input.dtiPercentage !== undefined) data.dtiPercentage = input.dtiPercentage;
  return data;
}

export interface EncryptedAccountUpdate {
  name?: string;
  type?: string;
  institution?: string;
  accountNumber?: string | null;
  currentBalance?: string;
  estimatedValue?: string | null;
  interestRate?: string | null;
  csvParserId?: string | null;
  originalBalance?: string | null;
  originationDate?: string | null;
  maturityDate?: string | null;
  loanType?: string | null;
  employerName?: string | null;
  isActive?: boolean;
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
}

export function encryptAccountForUpdate(input: {
  name?: string;
  type?: AccountType;
  institution?: string;
  accountNumber?: string | null;
  currentBalance?: number;
  estimatedValue?: number | null;
  interestRate?: number | null;
  csvParserId?: string | null;
  originalBalance?: number | null;
  originationDate?: string | null;
  maturityDate?: string | null;
  loanType?: string | null;
  employerName?: string | null;
  isActive?: boolean;
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
}): EncryptedAccountUpdate {
  const data: EncryptedAccountUpdate = {};

  if (input.name !== undefined) data.name = encryptField(input.name);
  if (input.type !== undefined) data.type = input.type;
  if (input.institution !== undefined)
    data.institution = encryptField(input.institution);
  if (input.accountNumber !== undefined)
    data.accountNumber = encryptOptionalField(input.accountNumber);
  if (input.currentBalance !== undefined)
    data.currentBalance = encryptNumber(input.currentBalance);
  if (input.estimatedValue !== undefined)
    data.estimatedValue = encryptOptionalNumber(input.estimatedValue);
  if (input.interestRate !== undefined)
    data.interestRate = encryptOptionalNumber(input.interestRate);
  if (input.csvParserId !== undefined)
    data.csvParserId = input.csvParserId;
  if (input.originalBalance !== undefined)
    data.originalBalance = encryptOptionalNumber(input.originalBalance);
  if (input.originationDate !== undefined)
    data.originationDate = encryptOptionalField(input.originationDate);
  if (input.maturityDate !== undefined)
    data.maturityDate = encryptOptionalField(input.maturityDate);
  if (input.loanType !== undefined)
    data.loanType = encryptOptionalField(input.loanType);
  if (input.employerName !== undefined)
    data.employerName = encryptOptionalField(input.employerName);
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.isFavorite !== undefined) data.isFavorite = input.isFavorite;
  if (input.excludeFromIncomeSources !== undefined) data.excludeFromIncomeSources = input.excludeFromIncomeSources;
  if (input.dtiPercentage !== undefined) data.dtiPercentage = input.dtiPercentage;

  return data;
}

// --- Transaction ---

export function decryptTransaction(row: PrismaTransaction): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date.toISOString(),
    description: decryptField(row.description),
    amount: decryptNumber(row.amount),
    category: row.category ?? undefined,
    notes: decryptOptionalField(row.notes),
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
  dedupeHash?: string | null;
}): {
  accountId: string;
  date: Date;
  description: string;
  amount: string;
  category: string | null;
  notes: string | null;
  dedupeHash: string | null;
} {
  return {
    accountId: input.accountId,
    date: input.date,
    description: encryptField(input.description),
    amount: encryptNumber(input.amount),
    category: input.category ?? null,
    notes: encryptOptionalField(input.notes),
    dedupeHash: input.dedupeHash ?? null,
  };
}

export function encryptTransactionForUpdate(input: {
  category?: string | null;
  notes?: string | null;
}): {
  category?: string | null;
  notes?: string | null;
} {
  const data: { category?: string | null; notes?: string | null } = {};
  if (input.category !== undefined) data.category = input.category;
  if (input.notes !== undefined)
    data.notes = encryptOptionalField(input.notes);
  return data;
}

// --- Balance ---

type PrismaBalanceWithProfiles = PrismaBalance & {
  loanProfile?: PrismaLoanProfile | null;
  investmentProfile?: PrismaInvestmentProfile | null;
  savingsProfile?: PrismaSavingsProfile | null;
  creditProfile?: PrismaCreditProfile | null;
};

export function decryptBalance(row: PrismaBalanceWithProfiles): Balance {
  const result: Balance = {
    accountId: row.accountId,
    balance: decryptNumber(row.balance),
    date: row.date.toISOString(),
  };

  if (row.loanProfile) {
    result.loanProfile = decryptLoanProfile(row.loanProfile);
  }
  if (row.investmentProfile) {
    result.investmentProfile = decryptInvestmentProfile(row.investmentProfile);
  }
  if (row.savingsProfile) {
    result.savingsProfile = decryptSavingsProfile(row.savingsProfile);
  }
  if (row.creditProfile) {
    result.creditProfile = decryptCreditProfile(row.creditProfile);
  }

  return result;
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

// --- Loan Profile ---

export function encryptLoanProfileForCreate(
  balanceId: string,
  data: LoanProfileData,
): {
  balanceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  interestRate: string | null;
  monthlyPayment: string | null;
  principalPaid: string | null;
  interestPaid: string | null;
  escrowAmount: string | null;
  nextPaymentDate: string | null;
  remainingTermMonths: string | null;
} {
  return {
    balanceId,
    periodStart: encryptOptionalField(data.periodStart) ?? null,
    periodEnd: encryptOptionalField(data.periodEnd) ?? null,
    interestRate: encryptOptionalNumber(data.interestRate) ?? null,
    monthlyPayment: encryptOptionalNumber(data.monthlyPayment) ?? null,
    principalPaid: encryptOptionalNumber(data.principalPaid) ?? null,
    interestPaid: encryptOptionalNumber(data.interestPaid) ?? null,
    escrowAmount: encryptOptionalNumber(data.escrowAmount) ?? null,
    nextPaymentDate: encryptOptionalField(data.nextPaymentDate) ?? null,
    remainingTermMonths: encryptOptionalNumber(data.remainingTermMonths) ?? null,
  };
}

export function decryptLoanProfile(row: PrismaLoanProfile): LoanProfileData {
  return {
    periodStart: decryptOptionalField(row.periodStart),
    periodEnd: decryptOptionalField(row.periodEnd),
    interestRate: decryptOptionalNumber(row.interestRate),
    monthlyPayment: decryptOptionalNumber(row.monthlyPayment),
    principalPaid: decryptOptionalNumber(row.principalPaid),
    interestPaid: decryptOptionalNumber(row.interestPaid),
    escrowAmount: decryptOptionalNumber(row.escrowAmount),
    nextPaymentDate: decryptOptionalField(row.nextPaymentDate),
    remainingTermMonths: decryptOptionalNumber(row.remainingTermMonths),
  };
}

// --- Investment Profile ---

export function encryptInvestmentProfileForCreate(
  balanceId: string,
  data: InvestmentProfileData,
): {
  balanceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  rateOfReturn: string | null;
  ytdReturn: string | null;
  totalGainLoss: string | null;
  contributions: string | null;
  employerMatch: string | null;
  vestingPct: string | null;
  fees: string | null;
  expenseRatio: string | null;
  dividends: string | null;
  capitalGains: string | null;
  numHoldings: string | null;
} {
  return {
    balanceId,
    periodStart: encryptOptionalField(data.periodStart) ?? null,
    periodEnd: encryptOptionalField(data.periodEnd) ?? null,
    rateOfReturn: encryptOptionalNumber(data.rateOfReturn) ?? null,
    ytdReturn: encryptOptionalNumber(data.ytdReturn) ?? null,
    totalGainLoss: encryptOptionalNumber(data.totalGainLoss) ?? null,
    contributions: encryptOptionalNumber(data.contributions) ?? null,
    employerMatch: encryptOptionalNumber(data.employerMatch) ?? null,
    vestingPct: encryptOptionalNumber(data.vestingPct) ?? null,
    fees: encryptOptionalNumber(data.fees) ?? null,
    expenseRatio: encryptOptionalNumber(data.expenseRatio) ?? null,
    dividends: encryptOptionalNumber(data.dividends) ?? null,
    capitalGains: encryptOptionalNumber(data.capitalGains) ?? null,
    numHoldings: encryptOptionalNumber(data.numHoldings) ?? null,
  };
}

export function decryptInvestmentProfile(
  row: PrismaInvestmentProfile,
): InvestmentProfileData {
  return {
    periodStart: decryptOptionalField(row.periodStart),
    periodEnd: decryptOptionalField(row.periodEnd),
    rateOfReturn: decryptOptionalNumber(row.rateOfReturn),
    ytdReturn: decryptOptionalNumber(row.ytdReturn),
    totalGainLoss: decryptOptionalNumber(row.totalGainLoss),
    contributions: decryptOptionalNumber(row.contributions),
    employerMatch: decryptOptionalNumber(row.employerMatch),
    vestingPct: decryptOptionalNumber(row.vestingPct),
    fees: decryptOptionalNumber(row.fees),
    expenseRatio: decryptOptionalNumber(row.expenseRatio),
    dividends: decryptOptionalNumber(row.dividends),
    capitalGains: decryptOptionalNumber(row.capitalGains),
    numHoldings: decryptOptionalNumber(row.numHoldings),
  };
}

// --- Savings Profile ---

export function encryptSavingsProfileForCreate(
  balanceId: string,
  data: SavingsProfileData,
): {
  balanceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  apy: string | null;
  interestEarned: string | null;
  interestEarnedYtd: string | null;
} {
  return {
    balanceId,
    periodStart: encryptOptionalField(data.periodStart) ?? null,
    periodEnd: encryptOptionalField(data.periodEnd) ?? null,
    apy: encryptOptionalNumber(data.apy) ?? null,
    interestEarned: encryptOptionalNumber(data.interestEarned) ?? null,
    interestEarnedYtd: encryptOptionalNumber(data.interestEarnedYtd) ?? null,
  };
}

export function decryptSavingsProfile(
  row: PrismaSavingsProfile,
): SavingsProfileData {
  return {
    periodStart: decryptOptionalField(row.periodStart),
    periodEnd: decryptOptionalField(row.periodEnd),
    apy: decryptOptionalNumber(row.apy),
    interestEarned: decryptOptionalNumber(row.interestEarned),
    interestEarnedYtd: decryptOptionalNumber(row.interestEarnedYtd),
  };
}

// --- Credit Profile ---

export function encryptCreditProfileForCreate(
  balanceId: string,
  data: CreditProfileData,
): {
  balanceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  apr: string | null;
  minimumPayment: string | null;
  creditLimit: string | null;
  availableCredit: string | null;
  interestCharged: string | null;
  feesCharged: string | null;
  rewardsEarned: string | null;
  paymentDueDate: string | null;
} {
  return {
    balanceId,
    periodStart: encryptOptionalField(data.periodStart) ?? null,
    periodEnd: encryptOptionalField(data.periodEnd) ?? null,
    apr: encryptOptionalNumber(data.apr) ?? null,
    minimumPayment: encryptOptionalNumber(data.minimumPayment) ?? null,
    creditLimit: encryptOptionalNumber(data.creditLimit) ?? null,
    availableCredit: encryptOptionalNumber(data.availableCredit) ?? null,
    interestCharged: encryptOptionalNumber(data.interestCharged) ?? null,
    feesCharged: encryptOptionalNumber(data.feesCharged) ?? null,
    rewardsEarned: encryptOptionalNumber(data.rewardsEarned) ?? null,
    paymentDueDate: encryptOptionalField(data.paymentDueDate) ?? null,
  };
}

export function decryptCreditProfile(
  row: PrismaCreditProfile,
): CreditProfileData {
  return {
    periodStart: decryptOptionalField(row.periodStart),
    periodEnd: decryptOptionalField(row.periodEnd),
    apr: decryptOptionalNumber(row.apr),
    minimumPayment: decryptOptionalNumber(row.minimumPayment),
    creditLimit: decryptOptionalNumber(row.creditLimit),
    availableCredit: decryptOptionalNumber(row.availableCredit),
    interestCharged: decryptOptionalNumber(row.interestCharged),
    feesCharged: decryptOptionalNumber(row.feesCharged),
    rewardsEarned: decryptOptionalNumber(row.rewardsEarned),
    paymentDueDate: decryptOptionalField(row.paymentDueDate),
  };
}

// --- Loan Static Data ---

export function encryptLoanStaticForUpdate(data: LoanStaticData): EncryptedAccountUpdate {
  const result: EncryptedAccountUpdate = {};
  if (data.originalBalance !== undefined)
    result.originalBalance = encryptOptionalNumber(data.originalBalance);
  if (data.originationDate !== undefined)
    result.originationDate = encryptOptionalField(data.originationDate);
  if (data.maturityDate !== undefined)
    result.maturityDate = encryptOptionalField(data.maturityDate);
  if (data.loanType !== undefined)
    result.loanType = encryptOptionalField(data.loanType);
  return result;
}

// --- Budget ---

export function decryptBudget(row: PrismaBudget): Budget {
  return {
    id: row.id,
    category: row.category,
    amount: decryptNumber(row.amount),
    effectiveFrom: row.effectiveFrom,
    notes: decryptOptionalField(row.notes),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptBudgetForCreate(input: {
  category: string;
  amount: number;
  effectiveFrom: string;
  notes?: string | null;
}): {
  category: string;
  amount: string;
  effectiveFrom: string;
  notes: string | null;
} {
  return {
    category: input.category,
    amount: encryptNumber(input.amount),
    effectiveFrom: input.effectiveFrom,
    notes: encryptOptionalField(input.notes),
  };
}

export function encryptBudgetForUpdate(input: {
  amount?: number;
  notes?: string | null;
}): {
  amount?: string;
  notes?: string | null;
} {
  const data: { amount?: string; notes?: string | null } = {};
  if (input.amount !== undefined) data.amount = encryptNumber(input.amount);
  if (input.notes !== undefined)
    data.notes = encryptOptionalField(input.notes);
  return data;
}

// --- Bill ---

export function decryptBill(row: PrismaBill): Bill {
  return {
    id: row.id,
    name: decryptField(row.name),
    amount: decryptNumber(row.amount),
    frequency: row.frequency as BillFrequency,
    dueDay: row.dueDay,
    dueMonth: row.dueMonth ?? undefined,
    dueWeekday: row.dueWeekday ?? undefined,
    category: row.category ?? undefined,
    accountId: row.accountId ?? undefined,
    notes: decryptOptionalField(row.notes),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptBillForCreate(input: {
  name: string;
  amount: number;
  frequency: string;
  dueDay: number;
  dueMonth?: number | null;
  dueWeekday?: number | null;
  category?: string | null;
  accountId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}): {
  name: string;
  amount: string;
  frequency: string;
  dueDay: number;
  dueMonth: number | null;
  dueWeekday: number | null;
  category: string | null;
  accountId: string | null;
  notes: string | null;
  isActive?: boolean;
} {
  const data: {
    name: string;
    amount: string;
    frequency: string;
    dueDay: number;
    dueMonth: number | null;
    dueWeekday: number | null;
    category: string | null;
    accountId: string | null;
    notes: string | null;
    isActive?: boolean;
  } = {
    name: encryptField(input.name),
    amount: encryptNumber(input.amount),
    frequency: input.frequency,
    dueDay: input.dueDay,
    dueMonth: input.dueMonth ?? null,
    dueWeekday: input.dueWeekday ?? null,
    category: input.category ?? null,
    accountId: input.accountId ?? null,
    notes: encryptOptionalField(input.notes),
  };
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

export function encryptBillForUpdate(input: {
  name?: string;
  amount?: number;
  frequency?: string;
  dueDay?: number;
  dueMonth?: number | null;
  dueWeekday?: number | null;
  category?: string | null;
  accountId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}): {
  name?: string;
  amount?: string;
  frequency?: string;
  dueDay?: number;
  dueMonth?: number | null;
  dueWeekday?: number | null;
  category?: string | null;
  accountId?: string | null;
  notes?: string | null;
  isActive?: boolean;
} {
  const data: {
    name?: string;
    amount?: string;
    frequency?: string;
    dueDay?: number;
    dueMonth?: number | null;
    dueWeekday?: number | null;
    category?: string | null;
    accountId?: string | null;
    notes?: string | null;
    isActive?: boolean;
  } = {};

  if (input.name !== undefined) data.name = encryptField(input.name);
  if (input.amount !== undefined) data.amount = encryptNumber(input.amount);
  if (input.frequency !== undefined) data.frequency = input.frequency;
  if (input.dueDay !== undefined) data.dueDay = input.dueDay;
  if (input.dueMonth !== undefined) data.dueMonth = input.dueMonth;
  if (input.dueWeekday !== undefined) data.dueWeekday = input.dueWeekday;
  if (input.category !== undefined) data.category = input.category;
  if (input.accountId !== undefined) data.accountId = input.accountId;
  if (input.notes !== undefined)
    data.notes = encryptOptionalField(input.notes);
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return data;
}

// --- Bill Payment ---

export function decryptBillPayment(row: PrismaBillPayment): BillPayment {
  return {
    id: row.id,
    billId: row.billId,
    dueDate: row.dueDate.toISOString(),
    paidDate: row.paidDate.toISOString(),
    amount: decryptNumber(row.amount),
  };
}

export function encryptBillPaymentForCreate(input: {
  billId: string;
  dueDate: Date;
  amount: number;
}): {
  billId: string;
  dueDate: Date;
  paidDate: Date;
  amount: string;
} {
  return {
    billId: input.billId,
    dueDate: input.dueDate,
    paidDate: new Date(),
    amount: encryptNumber(input.amount),
  };
}

// --- Income Source ---

export function decryptIncomeSource(row: PrismaIncomeSource): IncomeSource {
  return {
    id: row.id,
    name: decryptField(row.name),
    amount: decryptNumber(row.amount),
    frequency: row.frequency as IncomeSourceFrequency,
    isActive: row.isActive,
    notes: decryptOptionalField(row.notes),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptIncomeSourceForCreate(input: {
  name: string;
  amount: number;
  frequency: string;
  isActive?: boolean;
  notes?: string | null;
}): {
  name: string;
  amount: string;
  frequency: string;
  notes: string | null;
  isActive?: boolean;
} {
  const data: {
    name: string;
    amount: string;
    frequency: string;
    notes: string | null;
    isActive?: boolean;
  } = {
    name: encryptField(input.name),
    amount: encryptNumber(input.amount),
    frequency: input.frequency,
    notes: encryptOptionalField(input.notes),
  };
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

export function encryptIncomeSourceForUpdate(input: {
  name?: string;
  amount?: number;
  frequency?: string;
  isActive?: boolean;
  notes?: string | null;
}): {
  name?: string;
  amount?: string;
  frequency?: string;
  isActive?: boolean;
  notes?: string | null;
} {
  const data: {
    name?: string;
    amount?: string;
    frequency?: string;
    isActive?: boolean;
    notes?: string | null;
  } = {};

  if (input.name !== undefined) data.name = encryptField(input.name);
  if (input.amount !== undefined) data.amount = encryptNumber(input.amount);
  if (input.frequency !== undefined) data.frequency = input.frequency;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.notes !== undefined)
    data.notes = encryptOptionalField(input.notes);

  return data;
}

// --- Device Token ---

export function decryptDeviceToken(row: PrismaDeviceToken): DeviceToken {
  return {
    id: row.id,
    platform: row.platform as DevicePlatform,
    name: decryptOptionalField(row.name) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptDeviceTokenForCreate(input: {
  token: string;
  platform: string;
  name?: string;
}): {
  token: string;
  platform: string;
  name: string | null;
} {
  return {
    token: encryptField(input.token),
    platform: input.platform,
    name: encryptOptionalField(input.name),
  };
}

// --- Notification Preference ---

export function decryptNotificationPreference(
  row: PrismaNotificationPreference,
): NotificationPreference {
  const type = row.type as NotificationType;
  let config: NotificationConfig | null = null;
  if (row.config) {
    try {
      config = JSON.parse(decryptField(row.config)) as NotificationConfig;
    } catch {
      config = null;
    }
  }

  return {
    id: row.id,
    type,
    enabled: row.enabled,
    config: config ?? DEFAULT_NOTIFICATION_CONFIGS[type] ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptNotificationPreferenceForCreate(input: {
  type: string;
  enabled?: boolean;
  config?: NotificationConfig | null;
}): {
  type: string;
  enabled?: boolean;
  config: string | null;
} {
  const data: {
    type: string;
    enabled?: boolean;
    config: string | null;
  } = {
    type: input.type,
    config: input.config ? encryptField(JSON.stringify(input.config)) : null,
  };
  if (input.enabled !== undefined) data.enabled = input.enabled;
  return data;
}

export function encryptNotificationPreferenceForUpdate(input: {
  enabled?: boolean;
  config?: NotificationConfig | null;
}): {
  enabled?: boolean;
  config?: string | null;
} {
  const data: { enabled?: boolean; config?: string | null } = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.config !== undefined) {
    data.config = input.config ? encryptField(JSON.stringify(input.config)) : null;
  }
  return data;
}

// --- Notification Log ---

export function decryptNotificationLog(row: PrismaNotificationLog): NotificationLogEntry {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(decryptField(row.metadata)) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }

  return {
    id: row.id,
    type: row.type as NotificationType,
    title: decryptField(row.title),
    body: decryptField(row.body),
    isRead: row.isRead,
    sentAt: row.sentAt.toISOString(),
    metadata,
  };
}

export function encryptNotificationLogForCreate(input: {
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, unknown> | null;
}): {
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
  metadata: string | null;
} {
  return {
    type: input.type,
    title: encryptField(input.title),
    body: encryptField(input.body),
    dedupeKey: input.dedupeKey,
    metadata: input.metadata ? encryptField(JSON.stringify(input.metadata)) : null,
  };
}

// --- Goal ---

export function decryptGoal(row: PrismaGoal): Goal {
  let accountIds: string[] | undefined;
  if (row.accountIds) {
    try {
      accountIds = JSON.parse(decryptField(row.accountIds)) as string[];
    } catch {
      accountIds = undefined;
    }
  }

  return {
    id: row.id,
    name: decryptField(row.name),
    type: row.type as GoalType,
    targetAmount: decryptNumber(row.targetAmount),
    currentAmount: decryptOptionalNumber(row.currentAmount),
    targetDate: decryptOptionalField(row.targetDate),
    priority: row.priority,
    accountIds,
    extraPayment: decryptOptionalNumber(row.extraPayment),
    monthlyContribution: decryptOptionalNumber(row.monthlyContribution),
    startDate: decryptOptionalField(row.startDate),
    startAmount: decryptOptionalNumber(row.startAmount),
    notes: decryptOptionalField(row.notes),
    isActive: row.isActive,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt?.toISOString(),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptGoalForCreate(input: {
  name: string;
  type: string;
  targetAmount: number;
  currentAmount?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  startAmount?: number | null;
  priority?: number;
  accountIds?: string[] | null;
  extraPayment?: number | null;
  monthlyContribution?: number | null;
  notes?: string | null;
}): {
  name: string;
  type: string;
  targetAmount: string;
  currentAmount: string | null;
  targetDate: string | null;
  startDate: string | null;
  startAmount: string | null;
  priority?: number;
  accountIds: string | null;
  extraPayment: string | null;
  monthlyContribution: string | null;
  notes: string | null;
} {
  const data: {
    name: string;
    type: string;
    targetAmount: string;
    currentAmount: string | null;
    targetDate: string | null;
    startDate: string | null;
    startAmount: string | null;
    priority?: number;
    accountIds: string | null;
    extraPayment: string | null;
    monthlyContribution: string | null;
    notes: string | null;
  } = {
    name: encryptField(input.name),
    type: input.type,
    targetAmount: encryptNumber(input.targetAmount),
    currentAmount: encryptOptionalNumber(input.currentAmount),
    targetDate: encryptOptionalField(input.targetDate),
    startDate: encryptOptionalField(input.startDate),
    startAmount: encryptOptionalNumber(input.startAmount),
    accountIds: input.accountIds && input.accountIds.length > 0
      ? encryptField(JSON.stringify(input.accountIds))
      : null,
    extraPayment: encryptOptionalNumber(input.extraPayment),
    monthlyContribution: encryptOptionalNumber(input.monthlyContribution),
    notes: encryptOptionalField(input.notes),
  };
  if (input.priority !== undefined) data.priority = input.priority;
  return data;
}

export function encryptGoalForUpdate(input: {
  name?: string;
  type?: string;
  targetAmount?: number;
  currentAmount?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  startAmount?: number | null;
  priority?: number;
  accountIds?: string[] | null;
  extraPayment?: number | null;
  monthlyContribution?: number | null;
  notes?: string | null;
  isActive?: boolean;
  isCompleted?: boolean;
}): {
  name?: string;
  type?: string;
  targetAmount?: string;
  currentAmount?: string | null;
  targetDate?: string | null;
  startDate?: string | null;
  startAmount?: string | null;
  priority?: number;
  accountIds?: string | null;
  extraPayment?: string | null;
  monthlyContribution?: string | null;
  notes?: string | null;
  isActive?: boolean;
  isCompleted?: boolean;
  completedAt?: Date | null;
} {
  const data: {
    name?: string;
    type?: string;
    targetAmount?: string;
    currentAmount?: string | null;
    targetDate?: string | null;
    startDate?: string | null;
    startAmount?: string | null;
    priority?: number;
    accountIds?: string | null;
    extraPayment?: string | null;
    monthlyContribution?: string | null;
    notes?: string | null;
    isActive?: boolean;
    isCompleted?: boolean;
    completedAt?: Date | null;
  } = {};

  if (input.name !== undefined) data.name = encryptField(input.name);
  if (input.type !== undefined) data.type = input.type;
  if (input.targetAmount !== undefined) data.targetAmount = encryptNumber(input.targetAmount);
  if (input.currentAmount !== undefined) {
    data.currentAmount = encryptOptionalNumber(input.currentAmount);
  }
  if (input.targetDate !== undefined) {
    data.targetDate = encryptOptionalField(input.targetDate);
  }
  if (input.startDate !== undefined) {
    data.startDate = encryptOptionalField(input.startDate);
  }
  if (input.startAmount !== undefined) {
    data.startAmount = encryptOptionalNumber(input.startAmount);
  }
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.accountIds !== undefined) {
    data.accountIds = input.accountIds && input.accountIds.length > 0
      ? encryptField(JSON.stringify(input.accountIds))
      : null;
  }
  if (input.extraPayment !== undefined) {
    data.extraPayment = encryptOptionalNumber(input.extraPayment);
  }
  if (input.monthlyContribution !== undefined) {
    data.monthlyContribution = encryptOptionalNumber(input.monthlyContribution);
  }
  if (input.notes !== undefined) {
    data.notes = encryptOptionalField(input.notes);
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.isCompleted !== undefined) {
    data.isCompleted = input.isCompleted;
    data.completedAt = input.isCompleted ? new Date() : null;
  }

  return data;
}

// --- Holding ---

export function decryptHolding(row: PrismaHolding): Holding {
  const name = decryptField(row.name);
  const ticker = decryptOptionalField(row.ticker);
  const shares = decryptOptionalNumber(row.shares);
  const costBasis = decryptOptionalNumber(row.costBasis);
  const currentPrice = decryptOptionalNumber(row.currentPrice);

  let marketValue: number | undefined;
  let gainLoss: number | undefined;
  let gainLossPct: number | undefined;

  if (shares != null && currentPrice != null) {
    marketValue = shares * currentPrice;
    if (costBasis != null) {
      const totalCost = shares * costBasis;
      gainLoss = marketValue - totalCost;
      gainLossPct = totalCost !== 0 ? (gainLoss / totalCost) * 100 : 0;
    }
  }

  return {
    id: row.id,
    accountId: row.accountId,
    name,
    ticker,
    shares,
    costBasis,
    currentPrice,
    assetClass: row.assetClass as AssetClass,
    notes: decryptOptionalField(row.notes),
    sortOrder: row.sortOrder,
    marketValue,
    gainLoss,
    gainLossPct,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptHoldingForCreate(input: {
  accountId: string;
  name: string;
  ticker?: string | null;
  shares?: number | null;
  costBasis?: number | null;
  currentPrice?: number | null;
  assetClass: string;
  notes?: string | null;
}): {
  accountId: string;
  name: string;
  ticker: string | null;
  shares: string | null;
  costBasis: string | null;
  currentPrice: string | null;
  assetClass: string;
  notes: string | null;
} {
  return {
    accountId: input.accountId,
    name: encryptField(input.name),
    ticker: encryptOptionalField(input.ticker),
    shares: encryptOptionalNumber(input.shares),
    costBasis: encryptOptionalNumber(input.costBasis),
    currentPrice: encryptOptionalNumber(input.currentPrice),
    assetClass: input.assetClass,
    notes: encryptOptionalField(input.notes),
  };
}

export interface EncryptedHoldingUpdate {
  name?: string;
  ticker?: string | null;
  shares?: string | null;
  costBasis?: string | null;
  currentPrice?: string | null;
  assetClass?: string;
  notes?: string | null;
}

export function encryptHoldingForUpdate(input: {
  name?: string;
  ticker?: string | null;
  shares?: number | null;
  costBasis?: number | null;
  currentPrice?: number | null;
  assetClass?: string;
  notes?: string | null;
}): EncryptedHoldingUpdate {
  const data: EncryptedHoldingUpdate = {};

  if (input.name !== undefined) data.name = encryptField(input.name);
  if (input.ticker !== undefined) data.ticker = encryptOptionalField(input.ticker);
  if (input.shares !== undefined) data.shares = encryptOptionalNumber(input.shares);
  if (input.costBasis !== undefined) data.costBasis = encryptOptionalNumber(input.costBasis);
  if (input.currentPrice !== undefined) data.currentPrice = encryptOptionalNumber(input.currentPrice);
  if (input.assetClass !== undefined) data.assetClass = input.assetClass;
  if (input.notes !== undefined) data.notes = encryptOptionalField(input.notes);

  return data;
}

// --- Target Allocation ---

export function decryptTargetAllocation(row: PrismaTargetAllocation): TargetAllocation {
  return {
    id: row.id,
    accountId: row.accountId,
    assetClass: row.assetClass as AssetClass,
    targetPct: decryptNumber(row.targetPct),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function encryptTargetAllocationForCreate(input: {
  accountId?: string | null;
  assetClass: string;
  targetPct: number;
}): {
  accountId: string | null;
  assetClass: string;
  targetPct: string;
} {
  return {
    accountId: input.accountId ?? null,
    assetClass: input.assetClass,
    targetPct: encryptNumber(input.targetPct),
  };
}

// --- Price History ---

export function decryptPriceHistory(row: PrismaPriceHistory): {
  id: string;
  ticker: string;
  price: number;
  date: string;
  source: string;
} {
  return {
    id: row.id,
    ticker: row.ticker,
    price: decryptNumber(row.price),
    date: row.date.toISOString(),
    source: row.source,
  };
}
