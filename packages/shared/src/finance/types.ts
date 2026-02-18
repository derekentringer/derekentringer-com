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
