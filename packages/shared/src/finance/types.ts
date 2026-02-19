export enum AccountType {
  Checking = "checking",
  Savings = "savings",
  HighYieldSavings = "high_yield_savings",
  Credit = "credit",
  Investment = "investment",
  Loan = "loan",
  RealEstate = "real_estate",
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
  estimatedValue?: number;
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
  estimatedValue?: number;
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
  estimatedValue?: number | null;
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

// ─── Phase 4: Dashboard & Tracking ──────────────────────────────────────────

// Account classification
export const ASSET_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.Checking,
  AccountType.Savings,
  AccountType.HighYieldSavings,
  AccountType.Investment,
  AccountType.RealEstate,
] as const;

export const LIABILITY_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.Credit,
  AccountType.Loan,
] as const;

export function classifyAccountType(
  type: AccountType,
): "asset" | "liability" | "other" {
  if ((ASSET_ACCOUNT_TYPES as readonly string[]).includes(type)) return "asset";
  if ((LIABILITY_ACCOUNT_TYPES as readonly string[]).includes(type)) return "liability";
  return "other";
}

// Bill frequency
export type BillFrequency =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "weekly"
  | "biweekly";

export const BILL_FREQUENCIES: BillFrequency[] = [
  "monthly",
  "quarterly",
  "yearly",
  "weekly",
  "biweekly",
];

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  weekly: "Weekly",
  biweekly: "Biweekly",
};

// Bill types
export interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: BillFrequency;
  dueDay: number;
  dueMonth?: number;
  dueWeekday?: number;
  category?: string;
  accountId?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillRequest {
  name: string;
  amount: number;
  frequency: BillFrequency;
  dueDay: number;
  dueMonth?: number;
  dueWeekday?: number;
  category?: string;
  accountId?: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateBillRequest {
  name?: string;
  amount?: number;
  frequency?: BillFrequency;
  dueDay?: number;
  dueMonth?: number | null;
  dueWeekday?: number | null;
  category?: string | null;
  accountId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface BillListResponse {
  bills: Bill[];
}

export interface BillResponse {
  bill: Bill;
}

export interface BillPayment {
  id: string;
  billId: string;
  dueDate: string;
  paidDate: string;
  amount: number;
}

export interface UpcomingBillInstance {
  billId: string;
  billName: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  isOverdue: boolean;
  category?: string;
  paymentId?: string;
}

// Budget types
export interface Budget {
  id: string;
  category: string;
  amount: number;
  effectiveFrom: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetRequest {
  category: string;
  amount: number;
  effectiveFrom: string;
  notes?: string;
}

export interface UpdateBudgetRequest {
  amount?: number;
  notes?: string | null;
}

export interface BudgetListResponse {
  budgets: Budget[];
}

export interface BudgetResponse {
  budget: Budget;
}

export interface CategoryBudgetSummary {
  category: string;
  budgeted: number;
  actual: number;
  remaining: number;
  effectiveFrom: string;
}

export interface MonthlyBudgetSummaryResponse {
  month: string;
  categories: CategoryBudgetSummary[];
  totalBudgeted: number;
  totalActual: number;
  totalRemaining: number;
}

// Dashboard types
export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    balance: number;
    previousBalance?: number;
    classification: "asset" | "liability" | "other";
  }>;
}

export interface NetWorthHistoryPoint {
  month: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorthResponse {
  summary: NetWorthSummary;
  history: NetWorthHistoryPoint[];
}

export interface SpendingSummary {
  month: string;
  categories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  total: number;
}

export interface DashboardUpcomingBillsResponse {
  bills: UpcomingBillInstance[];
  totalDue: number;
  overdueCount: number;
}
