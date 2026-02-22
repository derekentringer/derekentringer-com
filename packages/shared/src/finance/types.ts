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
  isFavorite: boolean;
  excludeFromIncomeSources: boolean;
  dtiPercentage: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderAccountsRequest {
  order: Array<{ id: string; sortOrder: number }>;
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

export interface CreditProfileData {
  periodStart?: string;
  periodEnd?: string;
  apr?: number;
  minimumPayment?: number;
  creditLimit?: number;
  availableCredit?: number;
  interestCharged?: number;
  feesCharged?: number;
  rewardsEarned?: number;
  paymentDueDate?: string;
}

export interface Balance {
  accountId: string;
  balance: number;
  date: string;
  loanProfile?: LoanProfileData;
  investmentProfile?: InvestmentProfileData;
  savingsProfile?: SavingsProfileData;
  creditProfile?: CreditProfileData;
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
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
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
  isFavorite?: boolean;
  excludeFromIncomeSources?: boolean;
  dtiPercentage?: number;
}

export interface AccountListResponse {
  accounts: Account[];
}

export interface AccountResponse {
  account: Account;
}

// --- CSV Parser types ---

export type CsvParserId = "chase-checking" | "chase-credit" | "amex-hys" | "fidelity-401k" | "robinhood";

export const CSV_PARSER_IDS: CsvParserId[] = [
  "chase-checking",
  "chase-credit",
  "amex-hys",
  "fidelity-401k",
  "robinhood",
];

export const CSV_PARSER_LABELS: Record<CsvParserId, string> = {
  "chase-checking": "Chase Checking",
  "chase-credit": "Chase Credit Card",
  "amex-hys": "Amex High Yield Savings",
  "fidelity-401k": "Fidelity 401(k)",
  "robinhood": "Robinhood",
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
  creditProfile?: CreditProfileData;
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
  creditProfile?: CreditProfileData;
}

export interface PdfImportConfirmResponse {
  balance: number;
  date: string;
  accountUpdated: boolean;
  interestRateUpdated?: boolean;
  replaced?: boolean;
}

// --- Transaction request/response types ---

export interface UpdateTransactionRequest {
  category?: string | null;
  notes?: string | null;
}

export interface BulkUpdateCategoryRequest {
  ids: string[];
  category: string | null;
}

export interface BulkUpdateCategoryResponse {
  updated: number;
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

/** Category excluded from spending/income calculations to avoid double-counting transfers. */
export const TRANSFER_CATEGORY = "Transfer";

export function classifyAccountType(
  type: AccountType,
): "asset" | "liability" | "other" {
  if ((ASSET_ACCOUNT_TYPES as readonly string[]).includes(type)) return "asset";
  if ((LIABILITY_ACCOUNT_TYPES as readonly string[]).includes(type)) return "liability";
  return "other";
}

// Shared frequency type used by bills and income sources
export type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// Bill frequency (alias for backward compatibility)
export type BillFrequency = Frequency;

export const BILL_FREQUENCIES: BillFrequency[] = [
  "monthly",
  "quarterly",
  "yearly",
  "weekly",
  "biweekly",
];

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = FREQUENCY_LABELS;

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
    isFavorite: boolean;
  }>;
}

export type ChartTimeRange = "1m" | "3m" | "6m" | "12m" | "ytd" | "all";
export type ChartGranularity = "daily" | "weekly" | "monthly";

export interface NetWorthHistoryPoint {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorthResponse {
  summary: NetWorthSummary;
  history: NetWorthHistoryPoint[];
  accountHistory: Array<{ date: string; balances: Record<string, number> }>;
}

export interface DailySpendingPoint {
  date: string;
  amount: number;
}

export interface DailySpendingResponse {
  points: DailySpendingPoint[];
}

export interface IncomeSpendingPoint {
  date: string;
  income: number;
  spending: number;
}

export interface IncomeSpendingResponse {
  points: IncomeSpendingPoint[];
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

export interface AccountBalanceHistoryPoint {
  date: string;
  balance: number;
}

export interface AccountBalanceHistoryResponse {
  accountId: string;
  accountName: string;
  currentBalance: number;
  history: AccountBalanceHistoryPoint[];
}

// ─── Phase 5: Projections ──────────────────────────────────────────────────

// Income source frequency (alias for backward compatibility)
export type IncomeSourceFrequency = Frequency;

export const INCOME_SOURCE_FREQUENCIES: IncomeSourceFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
];

export const INCOME_SOURCE_FREQUENCY_LABELS: Record<IncomeSourceFrequency, string> = FREQUENCY_LABELS;

// Income Source CRUD types
export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  frequency: IncomeSourceFrequency;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncomeSourceRequest {
  name: string;
  amount: number;
  frequency: IncomeSourceFrequency;
  isActive?: boolean;
  notes?: string;
}

export interface UpdateIncomeSourceRequest {
  name?: string;
  amount?: number;
  frequency?: IncomeSourceFrequency;
  isActive?: boolean;
  notes?: string | null;
}

export interface IncomeSourceListResponse {
  incomeSources: IncomeSource[];
}

export interface IncomeSourceResponse {
  incomeSource: IncomeSource;
}

export interface DetectedIncomePatternsResponse {
  patterns: DetectedIncomePattern[];
}

// Auto-detected income from transaction history
export interface DetectedIncomePattern {
  description: string;
  averageAmount: number;
  frequency: IncomeSourceFrequency;
  monthlyEquivalent: number;
  occurrences: number;
  lastSeen: string;
}

// Net Income Projection
export interface NetIncomeProjectionPoint {
  month: string;
  income: number;
  expenses: number;
  netIncome: number;
}

export interface NetIncomeProjectionResponse {
  detectedIncome: DetectedIncomePattern[];
  manualIncome: IncomeSource[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyBillTotal: number;
  monthlyBudgetTotal: number;
  projection: NetIncomeProjectionPoint[];
}

// Per-Account Balance Projections
export interface AccountProjectionPoint {
  month: string;
  balance: number;
}

export interface AccountProjectionLine {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currentBalance: number;
  monthlyChange: number;
  isFavorite: boolean;
  projection: AccountProjectionPoint[];
}

export interface AccountProjectionsResponse {
  accounts: AccountProjectionLine[];
  overall: AccountProjectionPoint[];
}

// Savings Projection
export interface SavingsProjectionPoint {
  month: string;
  balance: number;
  principal: number;
  interest: number;
}

export interface SavingsAccountSummary {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currentBalance: number;
  apy: number;
  isFavorite: boolean;
  estimatedMonthlyContribution: number;
}

export interface SavingsProjectionResponse {
  account: SavingsAccountSummary;
  projection: SavingsProjectionPoint[];
  milestones: Array<{ targetAmount: number; targetDate: string | null }>;
}

// DTI (Debt-to-Income) Ratio
export interface DTIComponent {
  name: string;
  amount: number;
  type: "loan" | "bill" | "credit" | "manual" | "detected";
  dtiPercentage?: number;
}

export interface DTIResponse {
  ratio: number;
  monthlyDebtPayments: number;
  grossMonthlyIncome: number;
  debtComponents: DTIComponent[];
  incomeComponents: DTIComponent[];
}
