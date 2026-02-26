import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute, CommonActions } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type {
  ChartTimeRange,
  ChartGranularity,
  Account,
} from "@derekentringer/shared/finance";
import type { AccountsStackParamList } from "@/navigation/types";
import {
  useAccount,
  useUpdateAccount,
  useDeleteAccount,
} from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { BalanceHistoryChart } from "@/components/accounts/BalanceHistoryChart";
import { AccountFormSheet } from "@/components/accounts/AccountFormSheet";
import { PinGateModal } from "@/components/common/PinGateModal";
import { TimeRangeSelector } from "@/components/dashboard/TimeRangeSelector";
import { Card } from "@/components/common/Card";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  high_yield_savings: "High Yield Savings",
  credit: "Credit",
  investment: "Investment",
  loan: "Loan",
  real_estate: "Real Estate",
  other: "Other",
};

export function AccountDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AccountsStackParamList>>();
  const route = useRoute();
  const queryClient = useQueryClient();
  const { accountId, accountName } = route.params as {
    accountId: string;
    accountName: string;
  };

  const { data, isLoading, error, refetch } = useAccount(accountId);
  const updateMutation = useUpdateAccount();
  const deleteMutation = useDeleteAccount();
  const txQuery = useTransactions({ accountId, limit: 10 } as Parameters<typeof useTransactions>[0]);

  const [range, setRange] = useState<ChartTimeRange>("12m");
  const [granularity, setGranularity] = useState<ChartGranularity>("weekly");
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);

  const account = data?.account;

  useEffect(() => {
    navigation.setOptions({
      title: accountName,
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowForm(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit account"
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={22}
              color={colors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={handleDeletePrompt}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={22}
              color={colors.destructive}
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, accountName]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["accounts", accountId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "account-history", accountId] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient, accountId]);

  const handleDeletePrompt = useCallback(() => {
    Alert.alert("Delete Account", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setShowPinGate(true) },
    ]);
  }, []);

  const handleDeleteConfirmed = useCallback(
    async (pinToken: string) => {
      setShowPinGate(false);
      await deleteMutation.mutateAsync({ id: accountId, pinToken });
      navigation.goBack();
    },
    [accountId, deleteMutation, navigation],
  );

  const handleUpdate = useCallback(
    async (formData: Parameters<typeof updateMutation.mutateAsync>[0]["data"]) => {
      await updateMutation.mutateAsync({ id: accountId, data: formData });
      setShowForm(false);
    },
    [accountId, updateMutation],
  );

  const transactions = useMemo(() => {
    if (!txQuery.data?.pages) return [];
    return txQuery.data.pages.flatMap((p) => p.transactions).slice(0, 10);
  }, [txQuery.data]);

  const handleSeeAll = useCallback(() => {
    navigation.dispatch(
      CommonActions.navigate({
        name: "Activity",
        params: {
          screen: "TransactionsList",
          params: { accountId },
        },
      }),
    );
  }, [navigation, accountId]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.padding}>
          <SkeletonCard lines={3} />
        </View>
      </View>
    );
  }

  if (error || !account) {
    return (
      <View style={styles.container}>
        <View style={styles.padding}>
          <ErrorCard
            message="Failed to load account"
            onRetry={() => refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Balance Hero */}
        <Card>
          <Text style={styles.heroBalance}>
            {formatCurrencyFull(account.currentBalance)}
          </Text>
          <Text style={styles.heroName}>{account.name}</Text>
          {account.institution ? (
            <Text style={styles.heroInstitution}>{account.institution}</Text>
          ) : null}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
            </Text>
          </View>
        </Card>

        {/* Chart */}
        <View>
          <TimeRangeSelector
            range={range}
            granularity={granularity}
            onRangeChange={setRange}
            onGranularityChange={setGranularity}
          />
          <BalanceHistoryChart
            accountId={accountId}
            range={range}
            granularity={granularity}
          />
        </View>

        {/* Recent Transactions */}
        <View>
          <SectionHeader
            title="Recent Transactions"
            actionLabel="See All"
            onAction={handleSeeAll}
          />
          {transactions.length === 0 ? (
            <Text style={styles.emptyTx}>No transactions yet.</Text>
          ) : (
            transactions.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txLeft}>
                  <Text style={styles.txDesc} numberOfLines={1}>
                    {tx.description}
                  </Text>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    { color: tx.amount >= 0 ? colors.success : colors.error },
                  ]}
                >
                  {formatCurrency(Math.abs(tx.amount))}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {showForm && (
        <AccountFormSheet
          account={account}
          onClose={() => setShowForm(false)}
          onSubmit={handleUpdate}
        />
      )}

      <PinGateModal
        visible={showPinGate}
        onClose={() => setShowPinGate(false)}
        onVerified={handleDeleteConfirmed}
        title="Confirm Delete"
        description="Enter your PIN to delete this account"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padding: {
    padding: spacing.md,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRight: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
  },
  heroBalance: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  heroName: {
    color: colors.foreground,
    fontSize: 15,
  },
  heroInstitution: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  typeBadgeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  emptyTx: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  txDesc: {
    color: colors.foreground,
    fontSize: 14,
  },
  txDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
