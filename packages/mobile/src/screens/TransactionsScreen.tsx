import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useTransactions, useUpdateTransaction, useCategories } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { SearchBar } from "@/components/transactions/SearchBar";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { TransactionEditSheet } from "@/components/transactions/TransactionEditSheet";
import { EmptyState } from "@/components/common/EmptyState";
import { DateSectionHeader, groupByMonth } from "@/components/common/DateSectionHeader";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import type { Transaction } from "@derekentringer/shared/finance";
import { colors, spacing } from "@/theme";

type TransactionsRouteParams = {
  TransactionsList: { accountId?: string } | undefined;
};

export function TransactionsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<TransactionsRouteParams, "TransactionsList">>();

  const routeAccountId = route.params?.accountId;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountId, setAccountId] = useState<string | undefined>(routeAccountId);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Sync account filter when navigated to with a new accountId param
  useEffect(() => {
    if (routeAccountId !== undefined) {
      setAccountId(routeAccountId);
    }
  }, [routeAccountId]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => ({
      accountId,
      category,
      startDate,
      endDate,
      search: debouncedSearch || undefined,
    }),
    [accountId, category, startDate, endDate, debouncedSearch],
  );

  const transactionsQuery = useTransactions(filters);
  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories();
  const updateMutation = useUpdateTransaction();

  const transactions = useMemo(
    () => transactionsQuery.data?.pages.flatMap((p) => p.transactions) ?? [],
    [transactionsQuery.data],
  );

  const sections = useMemo(
    () => groupByMonth(transactions, (t) => t.date),
    [transactions],
  );

  const accountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? []).map((a) => ({
        id: a.id,
        name: a.name,
      })),
    [accountsQuery.data],
  );

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data?.categories ?? []).map((c) => ({
        name: c.name,
      })),
    [categoriesQuery.data],
  );

  const handleClearAll = useCallback(() => {
    setAccountId(undefined);
    setCategory(undefined);
    setStartDate(undefined);
    setEndDate(undefined);
  }, []);

  const handleDateRangeChange = useCallback(
    (start: string | undefined, end: string | undefined) => {
      setStartDate(start);
      setEndDate(end);
    },
    [],
  );

  const handleTransactionPress = useCallback(
    (transaction: Transaction) => {
      const nav = navigation as { navigate: (name: string, params: object) => void };
      nav.navigate("TransactionDetail", { transactionId: transaction.id });
    },
    [navigation],
  );

  const handleEditSave = useCallback(
    async (data: { category?: string | null; notes?: string | null }) => {
      if (!editingTransaction) return;
      await updateMutation.mutateAsync({
        id: editingTransaction.id,
        data,
      });
    },
    [editingTransaction, updateMutation],
  );

  const onRefresh = useCallback(async () => {
    await transactionsQuery.refetch();
  }, [transactionsQuery]);

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <TransactionRow
        transaction={item}
        onPress={() => handleTransactionPress(item)}
        onEdit={() => setEditingTransaction(item)}
      />
    ),
    [handleTransactionPress],
  );

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  const ListFooter = useMemo(() => {
    if (!transactionsQuery.isFetchingNextPage) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }, [transactionsQuery.isFetchingNextPage]);

  const ListEmpty = useMemo(() => {
    if (transactionsQuery.isLoading) return null;
    return <EmptyState message="No transactions found" />;
  }, [transactionsQuery.isLoading]);

  if (transactionsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <SearchBar value={search} onChangeText={setSearch} />
        </View>
        <View style={styles.skeletons}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} />
        <TransactionFilters
          accountId={accountId}
          category={category}
          startDate={startDate}
          endDate={endDate}
          onAccountChange={setAccountId}
          onCategoryChange={setCategory}
          onDateRangeChange={handleDateRangeChange}
          onClearAll={handleClearAll}
          accounts={accountOptions}
          categories={categoryOptions}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={({ section: { title } }) => (
          <DateSectionHeader title={title} />
        )}
        stickySectionHeadersEnabled
        onEndReached={() => {
          if (transactionsQuery.hasNextPage) {
            transactionsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        refreshControl={
          <RefreshControl
            refreshing={transactionsQuery.isRefetching && !transactionsQuery.isFetchingNextPage}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {editingTransaction && (
        <TransactionEditSheet
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSave={handleEditSave}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletons: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
});
