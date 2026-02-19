export enum AccountType {
  Checking = "checking",
  Savings = "savings",
  HighYieldSavings = "high_yield_savings",
  Credit = "credit",
  Investment = "investment",
  Loan = "loan",
  Other = "other",
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string;
  accountNumber?: string;
  currentBalance: number;
  interestRate?: number;
  csvParserId?: string;
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

export interface Balance {
  accountId: string;
  balance: number;
  date: string;
}

// --- Account request/response types ---

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  institution: string;
  currentBalance: number;
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

export type CsvParserId = "chase-checking" | "chase-credit" | "amex-hys";

export const CSV_PARSER_IDS: CsvParserId[] = [
  "chase-checking",
  "chase-credit",
  "amex-hys",
];

export const CSV_PARSER_LABELS: Record<CsvParserId, string> = {
  "chase-checking": "Chase Checking",
  "chase-credit": "Chase Credit Card",
  "amex-hys": "Amex High Yield Savings",
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
