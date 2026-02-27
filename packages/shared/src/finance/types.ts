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

export interface AccountTypeGroup {
  slug: string;
  label: string;
  types: AccountType[];
}

export const ACCOUNT_TYPE_GROUPS: AccountTypeGroup[] = [
  { slug: "checking", label: "Checking", types: [AccountType.Checking] },
  { slug: "savings", label: "Savings", types: [AccountType.Savings, AccountType.HighYieldSavings] },
  { slug: "credit", label: "Credit", types: [AccountType.Credit] },
  { slug: "loans", label: "Loans", types: [AccountType.Loan] },
  { slug: "real-estate", label: "Real Estate", types: [AccountType.RealEstate] },
  { slug: "investments", label: "Investments", types: [AccountType.Investment] },
];

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

export const CASH_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.Savings,
  AccountType.HighYieldSavings,
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

export function isCashAccountType(type: AccountType): boolean {
  return (CASH_ACCOUNT_TYPES as readonly string[]).includes(type);
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

// ─── Debt Payoff Planning ────────────────────────────────────────────────────

export type DebtPayoffStrategy = "avalanche" | "snowball" | "custom";

export interface DebtAccountSummary {
  accountId: string;
  name: string;
  type: AccountType;
  currentBalance: number;
  interestRate: number;
  minimumPayment: number;
  isMortgage: boolean;
}

export interface DebtPayoffMonthPoint {
  month: string;
  balance: number;
  principal: number;
  interest: number;
  payment: number;
  extraPayment: number;
}

export interface DebtPayoffAccountTimeline {
  accountId: string;
  name: string;
  payoffDate: string | null;
  totalInterestPaid: number;
  totalPaid: number;
  monthsToPayoff: number;
  schedule: DebtPayoffMonthPoint[];
}

export interface DebtActualVsPlanned {
  accountId: string;
  name: string;
  actual: Array<{ month: string; balance: number }>;
  planned: Array<{ month: string; balance: number }>;
  minimumOnly: Array<{ month: string; balance: number }>;
}

export interface DebtPayoffAggregatePoint {
  month: string;
  totalBalance: number;
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
}

export interface DebtPayoffStrategyResult {
  strategy: DebtPayoffStrategy;
  debtFreeDate: string | null;
  totalInterestPaid: number;
  totalPaid: number;
  timelines: DebtPayoffAccountTimeline[];
  aggregateSchedule: DebtPayoffAggregatePoint[];
}

export interface DebtPayoffResponse {
  debtAccounts: DebtAccountSummary[];
  avalanche: DebtPayoffStrategyResult;
  snowball: DebtPayoffStrategyResult;
  custom: DebtPayoffStrategyResult | null;
  actualVsPlanned: DebtActualVsPlanned[];
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

// Market mortgage rates (from FRED API)
export interface MortgageRatesResponse {
  rate30yr: number | null;
  rate15yr: number | null;
  asOf: string | null;
}

// ─── Financial Goal Planning ─────────────────────────────────────────────────

export type GoalType = "savings" | "debt_payoff" | "net_worth" | "custom";

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: "Savings",
  debt_payoff: "Debt Payoff",
  net_worth: "Net Worth",
  custom: "Custom Milestone",
};

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string;
  startDate?: string;
  startAmount?: number;
  priority: number;
  accountIds?: string[];
  extraPayment?: number;
  monthlyContribution?: number;
  notes?: string;
  isActive: boolean;
  isCompleted: boolean;
  completedAt?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalRequest {
  name: string;
  type: GoalType;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string;
  startDate?: string;
  startAmount?: number;
  priority?: number;
  accountIds?: string[];
  extraPayment?: number;
  monthlyContribution?: number;
  notes?: string;
}

export interface UpdateGoalRequest {
  name?: string;
  type?: GoalType;
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
}

export interface GoalListResponse {
  goals: Goal[];
}

export interface GoalResponse {
  goal: Goal;
}

export interface GoalProgressPoint {
  month: string;
  projected: number;
  actual?: number;
  target: number;
  minimumOnly?: number;
}

export interface GoalProgress {
  goalId: string;
  goalName: string;
  goalType: GoalType;
  targetAmount: number;
  currentAmount: number;
  percentComplete: number;
  monthlyContribution: number;
  targetDate: string | null;
  projectedCompletionDate: string | null;
  onTrack: boolean;
  projection: GoalProgressPoint[];
}

export interface GoalProgressResponse {
  goals: GoalProgress[];
  monthlySurplus: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtPayments: number;
}

export interface ReorderGoalsRequest {
  order: Array<{ id: string; sortOrder: number }>;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export enum NotificationType {
  BillDue = "bill_due",
  CreditPaymentDue = "credit_payment_due",
  LoanPaymentDue = "loan_payment_due",
  HighCreditUtilization = "high_credit_utilization",
  BudgetOverspend = "budget_overspend",
  LargeTransaction = "large_transaction",
  StatementReminder = "statement_reminder",
  Milestones = "milestones",
  AiAlert = "ai_alert",
}

export type NotificationPhase = 1 | 2 | 3;

export const NOTIFICATION_PHASES: Record<NotificationType, NotificationPhase> = {
  [NotificationType.BillDue]: 1,
  [NotificationType.CreditPaymentDue]: 1,
  [NotificationType.LoanPaymentDue]: 1,
  [NotificationType.HighCreditUtilization]: 2,
  [NotificationType.BudgetOverspend]: 2,
  [NotificationType.LargeTransaction]: 2,
  [NotificationType.StatementReminder]: 3,
  [NotificationType.Milestones]: 3,
  [NotificationType.AiAlert]: 3,
};

export type NotificationCategory = "reminders" | "alerts" | "milestones";

export const NOTIFICATION_CATEGORIES: Record<NotificationType, NotificationCategory> = {
  [NotificationType.BillDue]: "reminders",
  [NotificationType.CreditPaymentDue]: "reminders",
  [NotificationType.LoanPaymentDue]: "reminders",
  [NotificationType.HighCreditUtilization]: "alerts",
  [NotificationType.BudgetOverspend]: "alerts",
  [NotificationType.LargeTransaction]: "alerts",
  [NotificationType.StatementReminder]: "reminders",
  [NotificationType.Milestones]: "milestones",
  [NotificationType.AiAlert]: "alerts",
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  [NotificationType.BillDue]: "Bill Due",
  [NotificationType.CreditPaymentDue]: "Credit Payment Due",
  [NotificationType.LoanPaymentDue]: "Loan Payment Due",
  [NotificationType.HighCreditUtilization]: "High Credit Utilization",
  [NotificationType.BudgetOverspend]: "Budget Overspend",
  [NotificationType.LargeTransaction]: "Large Transaction",
  [NotificationType.StatementReminder]: "Statement Reminder",
  [NotificationType.Milestones]: "Milestones",
  [NotificationType.AiAlert]: "AI Smart Alerts",
};

export const NOTIFICATION_DESCRIPTIONS: Record<NotificationType, string> = {
  [NotificationType.BillDue]: "Get reminded when bills are due",
  [NotificationType.CreditPaymentDue]: "Get reminded when credit card payments are due",
  [NotificationType.LoanPaymentDue]: "Get reminded when loan payments are due",
  [NotificationType.HighCreditUtilization]: "Alert when credit utilization exceeds thresholds",
  [NotificationType.BudgetOverspend]: "Alert when spending approaches or exceeds budget",
  [NotificationType.LargeTransaction]: "Alert for transactions over a set amount",
  [NotificationType.StatementReminder]: "Remind to upload new statement data",
  [NotificationType.Milestones]: "Celebrate net worth and loan payoff milestones",
  [NotificationType.AiAlert]: "AI-powered anomaly detection and pattern insights",
};

// Per-type configuration interfaces
export interface BillDueConfig {
  reminderDaysBefore: number;
}

export interface CreditPaymentDueConfig {
  reminderDaysBefore: number;
}

export interface LoanPaymentDueConfig {
  reminderDaysBefore: number;
}

export interface HighCreditUtilizationConfig {
  thresholds: number[];
}

export interface BudgetOverspendConfig {
  warnAtPercent: number;
  alertAtPercent: number;
}

export interface LargeTransactionConfig {
  threshold: number;
}

export interface StatementReminderConfig {
  reminderDaysBefore: number;
  fallbackDayOfMonth: number;
}

export interface MilestonesConfig {
  netWorthMilestones: number[];
  loanPayoffPercentMilestones: number[];
}

export type AiAlertConfig = Record<string, never>;

export type NotificationConfig =
  | BillDueConfig
  | CreditPaymentDueConfig
  | LoanPaymentDueConfig
  | HighCreditUtilizationConfig
  | BudgetOverspendConfig
  | LargeTransactionConfig
  | StatementReminderConfig
  | MilestonesConfig
  | AiAlertConfig;

export const DEFAULT_NOTIFICATION_CONFIGS: Record<NotificationType, NotificationConfig> = {
  [NotificationType.BillDue]: { reminderDaysBefore: 3 } as BillDueConfig,
  [NotificationType.CreditPaymentDue]: { reminderDaysBefore: 3 } as CreditPaymentDueConfig,
  [NotificationType.LoanPaymentDue]: { reminderDaysBefore: 3 } as LoanPaymentDueConfig,
  [NotificationType.HighCreditUtilization]: { thresholds: [30, 70] } as HighCreditUtilizationConfig,
  [NotificationType.BudgetOverspend]: { warnAtPercent: 80, alertAtPercent: 100 } as BudgetOverspendConfig,
  [NotificationType.LargeTransaction]: { threshold: 500 } as LargeTransactionConfig,
  [NotificationType.StatementReminder]: { reminderDaysBefore: 3, fallbackDayOfMonth: 28 } as StatementReminderConfig,
  [NotificationType.Milestones]: {
    netWorthMilestones: [50000, 100000, 250000, 500000, 1000000],
    loanPayoffPercentMilestones: [25, 50, 75, 90, 100],
  } as MilestonesConfig,
  [NotificationType.AiAlert]: {} as AiAlertConfig,
};

// Device token types
export type DevicePlatform = "web" | "ios" | "android";

export interface DeviceToken {
  id: string;
  platform: DevicePlatform;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDeviceRequest {
  token: string;
  platform: DevicePlatform;
  name?: string;
}

export interface DeviceTokenListResponse {
  devices: DeviceToken[];
}

// Notification preference types
export interface NotificationPreference {
  id: string;
  type: NotificationType;
  enabled: boolean;
  config: NotificationConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateNotificationPreferenceRequest {
  enabled?: boolean;
  config?: NotificationConfig | null;
}

export interface NotificationPreferenceListResponse {
  preferences: NotificationPreference[];
}

// Notification log types
export interface NotificationLogEntry {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  sentAt: string;
  metadata: Record<string, unknown> | null;
}

export interface NotificationHistoryResponse {
  notifications: NotificationLogEntry[];
  total: number;
}

export interface UnreadCountResponse {
  count: number;
}

// ─── Investment Portfolio Analysis ───────────────────────────────────────────

export type AssetClass = "stocks" | "bonds" | "real_estate" | "cash" | "crypto" | "other";

export const ASSET_CLASSES: AssetClass[] = [
  "stocks",
  "bonds",
  "real_estate",
  "cash",
  "crypto",
  "other",
];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stocks: "Stocks",
  bonds: "Bonds",
  real_estate: "Real Estate",
  cash: "Cash",
  crypto: "Crypto",
  other: "Other",
};

export interface Holding {
  id: string;
  accountId: string;
  name: string;
  ticker?: string;
  shares?: number;
  costBasis?: number;
  currentPrice?: number;
  assetClass: AssetClass;
  notes?: string;
  sortOrder: number;
  marketValue?: number;
  gainLoss?: number;
  gainLossPct?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHoldingRequest {
  accountId: string;
  name: string;
  ticker?: string;
  shares?: number;
  costBasis?: number;
  currentPrice?: number;
  assetClass: AssetClass;
  notes?: string;
}

export interface UpdateHoldingRequest {
  name?: string;
  ticker?: string | null;
  shares?: number | null;
  costBasis?: number | null;
  currentPrice?: number | null;
  assetClass?: AssetClass;
  notes?: string | null;
}

export interface ReorderHoldingsRequest {
  order: Array<{ id: string; sortOrder: number }>;
}

export interface HoldingListResponse {
  holdings: Holding[];
}

export interface HoldingResponse {
  holding: Holding;
}

// Target allocations

export interface TargetAllocation {
  id: string;
  accountId: string | null;
  assetClass: AssetClass;
  targetPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface SetTargetAllocationsRequest {
  accountId?: string | null;
  allocations: Array<{
    assetClass: AssetClass;
    targetPct: number;
  }>;
}

export interface TargetAllocationListResponse {
  allocations: TargetAllocation[];
}

// Asset allocation

export interface AssetAllocationSlice {
  assetClass: AssetClass;
  label: string;
  marketValue: number;
  percentage: number;
  targetPct?: number;
  drift?: number;
}

export interface AssetAllocationResponse {
  slices: AssetAllocationSlice[];
  totalMarketValue: number;
}

// Performance

/** Portfolio performance periods. Differs from ChartTimeRange (used by dashboard net-worth charts) which also includes "ytd". */
export type PerformancePeriod = "1m" | "3m" | "6m" | "12m" | "all";

export interface PerformancePoint {
  date: string;
  portfolioValue: number;
  benchmarkValue?: number;
}

export interface PerformanceSummary {
  totalValue: number;
  totalCost: number;
  totalReturn: number;
  totalReturnPct: number;
  benchmarkReturnPct?: number;
}

export interface PerformanceResponse {
  summary: PerformanceSummary;
  series: PerformancePoint[];
  period: PerformancePeriod;
}

// Rebalancing

export interface RebalanceSuggestion {
  assetClass: AssetClass;
  label: string;
  currentPct: number;
  targetPct: number;
  drift: number;
  action: "buy" | "sell" | "hold";
  amount: number;
}

export interface RebalanceResponse {
  suggestions: RebalanceSuggestion[];
  totalMarketValue: number;
}

// Finnhub quote

export interface QuoteResponse {
  ticker: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

// ─── AI Insights ────────────────────────────────────────────────────────────

export type AiInsightScope =
  | "dashboard" | "budget" | "goals" | "spending" | "accounts"
  | "projections" | "decision-tools" | "monthly-digest" | "quarterly-digest" | "alerts";

export type AiInsightType = "observation" | "recommendation" | "alert" | "celebration";
export type AiInsightSeverity = "info" | "warning" | "success";

export interface AiInsight {
  id: string;
  scope: AiInsightScope;
  type: AiInsightType;
  severity: AiInsightSeverity;
  title: string;
  body: string;
  relatedPage?: string;
  generatedAt: string;
  expiresAt: string;
}

export type AiRefreshFrequency = "weekly" | "daily" | "on_data_change";

export interface AiInsightPreferences {
  masterEnabled: boolean;
  dashboardCard: boolean;
  monthlyDigest: boolean;
  quarterlyDigest: boolean;
  pageNudges: boolean;
  smartAlerts: boolean;
  refreshFrequency: AiRefreshFrequency;
}

export const DEFAULT_AI_INSIGHT_PREFERENCES: AiInsightPreferences = {
  masterEnabled: false,
  dashboardCard: true,
  monthlyDigest: true,
  quarterlyDigest: true,
  pageNudges: true,
  smartAlerts: true,
  refreshFrequency: "weekly",
};

export interface AiInsightPreferencesResponse {
  preferences: AiInsightPreferences;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number;
}

export type UpdateAiInsightPreferencesRequest = Partial<AiInsightPreferences>;

export interface AiInsightsResponse {
  insights: AiInsight[];
  cached: boolean;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number;
  statuses?: { insightId: string; isRead: boolean; isDismissed: boolean }[];
}

export interface AiInsightsRequest {
  scope: AiInsightScope;
  month?: string;
  quarter?: string;
}

export interface AiInsightStatusEntry {
  insightId: string;
  scope: AiInsightScope;
  type: AiInsightType;
  severity: AiInsightSeverity;
  title: string;
  body: string;
  relatedPage?: string;
  generatedAt: string;
  isRead: boolean;
  isDismissed: boolean;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface AiInsightArchiveResponse {
  insights: AiInsightStatusEntry[];
  total: number;
}

export interface AiInsightUnseenCountResponse {
  dashboard: number;
  banners: number;
}

// ─── Decision Tools ─────────────────────────────────────────────────────────

// HYS vs. Debt Payoff
export interface HysVsDebtInputs {
  hysBalance: number;
  hysApy: number;
  loanBalance: number;
  loanApr: number;
  monthlyPayment: number;
  hysAccountId?: string;
  loanAccountId?: string;
}

export interface HysVsDebtMonthPoint {
  month: number;
  label: string;
  scenarioA_hysBalance: number;
  scenarioA_loanBalance: number;
  scenarioA_netPosition: number;
  scenarioB_hysBalance: number;
  scenarioB_loanBalance: number;
  scenarioB_netPosition: number;
}

export interface HysVsDebtResult {
  schedule: HysVsDebtMonthPoint[];
  scenarioA_totalInterestEarned: number;
  scenarioA_totalInterestPaid: number;
  scenarioB_totalInterestEarned: number;
  scenarioB_totalInterestPaid: number;
  netBenefit: number;
  breakEvenMonth: number | null;
  recommendation: "keep-hys" | "pay-loan";
}

// 401(k) Contribution Optimizer
export interface FourOhOneKInputs {
  annualSalary: number;
  currentContributionPct: number;
  employerMatchPct: number;
  employerMatchCapPct: number;
  expectedAnnualReturnPct: number;
  currentBalance: number;
  investmentAccountId?: string;
}

export interface FourOhOneKYearPoint {
  year: number;
  label: string;
  currentBalance: number;
  optimalBalance: number;
  maxBalance: number;
}

export interface FourOhOneKResult {
  currentAnnualContribution: number;
  currentEmployerMatch: number;
  optimalContributionPct: number;
  optimalAnnualContribution: number;
  optimalEmployerMatch: number;
  moneyLeftOnTable: number;
  projection: FourOhOneKYearPoint[];
}
