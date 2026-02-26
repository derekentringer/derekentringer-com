export type AccountsStackParamList = {
  AccountsList: undefined;
  AccountType: { groupSlug: string; groupLabel: string };
  AccountDetail: { accountId: string; accountName: string };
};

export type ActivityStackParamList = {
  TransactionsList: { accountId?: string } | undefined;
  TransactionDetail: { transactionId: string };
};

export type PlanningStackParamList = {
  PlanningHome: undefined;
  BillsList: undefined;
  BillDetail: { billId: string; billName: string };
  BudgetsList: undefined;
};
