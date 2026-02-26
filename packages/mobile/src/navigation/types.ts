export type AccountsStackParamList = {
  AccountsList: undefined;
  AccountType: { groupSlug: string; groupLabel: string };
  AccountDetail: { accountId: string; accountName: string };
};

export type ActivityStackParamList = {
  TransactionsList: { accountId?: string } | undefined;
  TransactionDetail: { transactionId: string };
};
