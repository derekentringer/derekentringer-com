export enum AccountType {
  Checking = "checking",
  Savings = "savings",
  HighYieldSavings = "high_yield_savings",
  Credit = "credit",
  Investment = "investment",
  Loan = "loan",
  Other = "other",
}

export type LoanType = "fixed" | "variable" | "fixed-mortgage" | "variable-mortgage";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string;
  accountNumber?: string;
  currentBalance: number;
  interestRate?: number;
  csvParserId?: string;
  originalBalance?: number;
  originationDate?: string;
  maturityDate?: string;
  loanType?: LoanType;
  employerName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanProfileData {
  periodStart?: string;
  periodEnd?: string;
  interestRate?: number;
  monthlyPayment?: number;
  principalPaid?: number;
  interestPaid?: number;
  escrowAmount?: number;
  nextPaymentDate?: string;
  remainingTermMonths?: number;
}

export interface LoanStaticData {
  originalBalance?: number;
  originationDate?: string;
  maturityDate?: string;
  loanType?: LoanType;
}

export interface InvestmentProfileData {
  periodStart?: string;
  periodEnd?: string;
  rateOfReturn?: number;
  ytdReturn?: number;
  totalGainLoss?: number;
  contributions?: number;
  employerMatch?: number;
  vestingPct?: number;
  fees?: number;
  expenseRatio?: number;
  dividends?: number;
  capitalGains?: number;
  numHoldings?: number;
}

export interface SavingsProfileData {
  periodStart?: string;
  periodEnd?: string;
  apy?: number;
  interestEarned?: number;
  interestEarnedYtd?: number;
}

export interface Balance {
  accountId: string;
  balance: number;
  date: string;
  loanProfile?: LoanProfileData;
  investmentProfile?: InvestmentProfileData;
  savingsProfile?: SavingsProfileData;
}

// --- Account request/response types ---

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  institution?: string;
  currentBalance?: number;
  accountNumber?: string;
  interestRate?: number;
  csvParserId?: string;
  isActive?: boolean;
}

export interface UpdateAccountRequest {
  name?: string;
  type?: AccountType;
  institution?: string;
  currentBalance?: number;
  accountNumber?: string | null;
  interestRate?: number | null;
  csvParserId?: string | null;
  isActive?: boolean;
}

export interface AccountListResponse {
  accounts: Account[];
}

export interface AccountResponse {
  account: Account;
}

// --- CSV Parser types ---

export type CsvParserId = "chase-checking" | "chase-credit" | "amex-hys" | "fidelity-401k";

export const CSV_PARSER_IDS: CsvParserId[] = [
  "chase-checking",
  "chase-credit",
  "amex-hys",
  "fidelity-401k",
];

export const CSV_PARSER_LABELS: Record<CsvParserId, string> = {
  "chase-checking": "Chase Checking",
  "chase-credit": "Chase Credit Card",
  "amex-hys": "Amex High Yield Savings",
  "fidelity-401k": "Fidelity 401(k)",
};

// --- Category types ---

export interface Category {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  sortOrder?: number;
}

export interface CategoryListResponse {
  categories: Category[];
}

export interface CategoryResponse {
  category: Category;
}

// --- Category Rule types ---

export type RuleMatchType = "exact" | "contains";

export interface CategoryRule {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  category: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRuleRequest {
  pattern: string;
  matchType: RuleMatchType;
  category: string;
  priority?: number;
}

export interface UpdateCategoryRuleRequest {
  pattern?: string;
  matchType?: RuleMatchType;
  category?: string;
  priority?: number;
}

export interface CategoryRuleListResponse {
  categoryRules: CategoryRule[];
}

export interface CategoryRuleResponse {
  categoryRule: CategoryRule;
  appliedCount?: number;
}

// --- CSV Import types ---

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string | null;
  bankCategory: string | null;
  dedupeHash: string;
  isDuplicate: boolean;
}

export interface CsvImportPreviewResponse {
  transactions: ParsedTransaction[];
  totalRows: number;
  duplicateCount: number;
  categorizedCount: number;
}

export interface CsvImportConfirmRequest {
  accountId: string;
  transactions: Array<{
    date: string;
    description: string;
    amount: number;
    category: string | null;
    dedupeHash: string;
  }>;
}

export interface CsvImportConfirmResponse {
  imported: number;
  skipped: number;
}

// --- PDF Import types ---

export interface PdfImportPreviewResponse {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  date: string;
  rawExtraction: { balanceText: string; dateText: string };
  existingBalance: number | null;
  existingBalanceOnDate: number | null;
  loanProfile?: LoanProfileData;
  loanStatic?: LoanStaticData;
  investmentProfile?: InvestmentProfileData;
  savingsProfile?: SavingsProfileData;
  rawProfileExtraction?: Record<string, string>;
}

export interface PdfImportConfirmRequest {
  accountId: string;
  balance: number;
  date: string;
  updateCurrentBalance: boolean;
  updateInterestRate?: boolean;
  loanProfile?: LoanProfileData;
  loanStatic?: LoanStaticData;
  investmentProfile?: InvestmentProfileData;
  savingsProfile?: SavingsProfileData;
}

export interface PdfImportConfirmResponse {
  balance: number;
  date: string;
  accountUpdated: boolean;
  interestRateUpdated?: boolean;
}

// --- Transaction request/response types ---

export interface UpdateTransactionRequest {
  category?: string | null;
  notes?: string | null;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
}

export interface TransactionResponse {
  transaction: Transaction;
}
