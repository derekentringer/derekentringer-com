import React, { useState, useMemo, useCallback } from "react";
import { ScrollView, View, Text, Pressable, RefreshControl, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import {
  useNetWorth,
  useSpendingSummary,
  useUpcomingBills,
  useDailySpending,
  useIncomeSpending,
  useDTI,
} from "@/hooks/useDashboard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { AiInsightCard } from "@/components/dashboard/AiInsightCard";
import { NetWorthChart } from "@/components/dashboard/NetWorthChart";
import { IncomeSpendingChart } from "@/components/dashboard/IncomeSpendingChart";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { UpcomingBillsList } from "@/components/dashboard/UpcomingBillsList";
import { GoalsSummaryCard } from "@/components/dashboard/GoalsSummaryCard";
import { DtiDetailSheet } from "@/components/dashboard/DtiDetailSheet";
import { NetWorthDetailSheet } from "@/components/dashboard/NetWorthDetailSheet";
import { IncomeDetailSheet } from "@/components/dashboard/IncomeDetailSheet";
import { SpendingDetailSheet } from "@/components/dashboard/SpendingDetailSheet";
import { FavoriteAccountCards } from "@/components/dashboard/FavoriteAccountCards";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { Card } from "@/components/common/Card";
import { colors, spacing } from "@/theme";

function getDateStrings() {
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { startOfMonth, today };
}

export function DashboardScreen() {
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [dtiSheetOpen, setDtiSheetOpen] = useState(false);
  const [netWorthSheetOpen, setNetWorthSheetOpen] = useState(false);
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);
  const [spendingSheetOpen, setSpendingSheetOpen] = useState(false);

  const { startOfMonth, today } = useMemo(() => getDateStrings(), []);

  // Data queries
  const netWorthQuery = useNetWorth("12m", "weekly");
  const dailyNetWorthQuery = useNetWorth("1m", "daily");
  const spendingQuery = useSpendingSummary();
  const dailySpendingQuery = useDailySpending(startOfMonth, today);
  const billsQuery = useUpcomingBills(30);
  const incomeSpendingQuery = useIncomeSpending("12m", "monthly", "sources");
  const mtdIncomeQuery = useIncomeSpending("1m", "daily", "all");
  const dtiQuery = useDTI();

  // Favorite account IDs
  const favoriteAccountIds = useMemo(() => {
    if (!netWorthQuery.data) return [];
    return netWorthQuery.data.summary.accounts
      .filter((a) => a.isFavorite)
      .map((a) => a.id);
  }, [netWorthQuery.data]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["goals"] }),
      queryClient.invalidateQueries({ queryKey: ["ai"] }),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  // Empty state: no accounts
  if (
    !netWorthQuery.isLoading &&
    !netWorthQuery.error &&
    netWorthQuery.data &&
    netWorthQuery.data.summary.accounts.length === 0
  ) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>Add your first account to get started.</Text>
          <Pressable
            style={styles.emptyButton}
            onPress={() => {
              const nav = navigation as { navigate: (name: string) => void };
              nav.navigate("Accounts");
            }}
            accessibilityRole="button"
            accessibilityLabel="Go to Accounts"
          >
            <Text style={styles.emptyButtonText}>Go to Accounts</Text>
          </Pressable>
        </Card>
      </ScrollView>
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
        {/* KPI Grid */}
        <KpiGrid
          netWorth={netWorthQuery.data}
          dailyNetWorth={dailyNetWorthQuery.data}
          spending={spendingQuery.data}
          dailySpending={dailySpendingQuery.data}
          mtdIncome={mtdIncomeQuery.data}
          dti={dtiQuery.data}
          netWorthLoading={netWorthQuery.isLoading}
          spendingLoading={spendingQuery.isLoading || dailySpendingQuery.isLoading}
          incomeLoading={incomeSpendingQuery.isLoading || mtdIncomeQuery.isLoading}
          dtiLoading={dtiQuery.isLoading}
          netWorthError={netWorthQuery.error ? "Failed to load net worth" : ""}
          spendingError={spendingQuery.error ? "Failed to load spending" : ""}
          incomeError={incomeSpendingQuery.error ? "Failed to load income" : ""}
          dtiError={dtiQuery.error ? "Failed to load DTI" : ""}
          onRetryNetWorth={() => netWorthQuery.refetch()}
          onRetrySpending={() => { spendingQuery.refetch(); dailySpendingQuery.refetch(); }}
          onRetryIncome={() => { incomeSpendingQuery.refetch(); mtdIncomeQuery.refetch(); }}
          onRetryDti={() => dtiQuery.refetch()}
          onNetWorthPress={() => setNetWorthSheetOpen(true)}
          onIncomePress={() => setIncomeSheetOpen(true)}
          onSpendingPress={() => setSpendingSheetOpen(true)}
          onDtiPress={() => setDtiSheetOpen(true)}
        />

        {/* AI Insights */}
        <AiInsightCard />

        {/* Net Worth Chart */}
        <NetWorthChart />

        {/* Income vs Spending Chart */}
        <IncomeSpendingChart />

        {/* Spending Pie */}
        {spendingQuery.isLoading ? (
          <SkeletonChartCard height={200} />
        ) : spendingQuery.error ? (
          <ErrorCard message="Failed to load spending" onRetry={() => spendingQuery.refetch()} />
        ) : spendingQuery.data ? (
          <SpendingChart data={spendingQuery.data} />
        ) : null}

        {/* Upcoming Bills */}
        {billsQuery.isLoading ? (
          <SkeletonChartCard height={150} />
        ) : billsQuery.error ? (
          <ErrorCard message="Failed to load bills" onRetry={() => billsQuery.refetch()} />
        ) : billsQuery.data ? (
          <UpcomingBillsList data={billsQuery.data} />
        ) : null}

        {/* Goals Summary */}
        <GoalsSummaryCard />

        {/* Favorite Account Cards */}
        <FavoriteAccountCards accountIds={favoriteAccountIds} />

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Net Worth Bottom Sheet */}
      {netWorthSheetOpen && netWorthQuery.data && (
        <NetWorthDetailSheet
          data={netWorthQuery.data}
          onClose={() => setNetWorthSheetOpen(false)}
        />
      )}

      {/* Income Bottom Sheet */}
      {incomeSheetOpen && (
        <IncomeDetailSheet
          mtdData={mtdIncomeQuery.data}
          yearlyData={incomeSpendingQuery.data}
          onClose={() => setIncomeSheetOpen(false)}
        />
      )}

      {/* Spending Bottom Sheet */}
      {spendingSheetOpen && spendingQuery.data && (
        <SpendingDetailSheet
          data={spendingQuery.data}
          onClose={() => setSpendingSheetOpen(false)}
        />
      )}

      {/* DTI Bottom Sheet */}
      {dtiSheetOpen && dtiQuery.data && (
        <DtiDetailSheet
          data={dtiQuery.data}
          onClose={() => setDtiSheetOpen(false)}
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
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyButtonText: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
