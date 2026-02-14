export enum AccountType {
  Checking = "checking",
  Savings = "savings",
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
