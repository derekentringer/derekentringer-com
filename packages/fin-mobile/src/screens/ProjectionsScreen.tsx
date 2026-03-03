import React, { useState, useCallback, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Switch,
  RefreshControl,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Slider } from "@/components/common/Slider";
import { classifyAccountType } from "@derekentringer/shared/finance";
import type { AccountProjectionLine } from "@derekentringer/shared/finance";
import { TimePeriodSelector } from "@/components/projections/TimePeriodSelector";
import type { TimePeriod } from "@/components/projections/TimePeriodSelector";
import { AccountBalanceChart } from "@/components/projections/AccountBalanceChart";
import { SavingsProjectionCard } from "@/components/projections/SavingsProjectionCard";
import { DebtStrategyToggle } from "@/components/projections/DebtStrategyToggle";
import { DebtPayoffChart } from "@/components/projections/DebtPayoffChart";
import {
  useNetIncomeProjection,
  useAccountProjections,
  useSavingsAccounts,
  useDebtAccounts,
  useDebtPayoff,
} from "@/hooks/useProjections";
import { CHART_COLORS, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

type Tab = "net-income" | "savings" | "debt-payoff";

const TAB_OPTIONS: Array<{ value: Tab; label: string }> = [
  { value: "net-income", label: "Net Income" },
  { value: "savings", label: "Savings" },
  { value: "debt-payoff", label: "Debt Payoff" },
];

export function ProjectionsScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("net-income");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["projections"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <ScrollView
      style={styles.container}
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
      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} />

      {tab === "net-income" && <NetIncomeTab />}
      {tab === "savings" && <SavingsTab />}
      {tab === "debt-payoff" && <DebtPayoffTab />}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function NetIncomeTab() {
  const [months, setMonths] = useState<TimePeriod>(12);
  const { data, isLoading, error, refetch } = useNetIncomeProjection(months);
  const accountQuery = useAccountProjections(months);
  const accountData = accountQuery.data;

  const { assetAccounts, liabilityAccounts } = useMemo(() => {
    const assets: AccountProjectionLine[] = [];
    const liabilities: AccountProjectionLine[] = [];
    if (accountData) {
      for (const acct of accountData.accounts) {
        if (classifyAccountType(acct.accountType) === "liability") {
          liabilities.push(acct);
        } else {
          assets.push(acct);
        }
      }
    }
    return { assetAccounts: assets, liabilityAccounts: liabilities };
  }, [accountData]);

  const overallBalance = accountData?.overall[0]?.balance ?? 0;

  const loading = (isLoading && !data) || (accountQuery.isLoading && !accountData);
  if (loading) return <SkeletonChartCard height={250} />;
  if ((error || accountQuery.error) && !data) {
    return (
      <ErrorCard
        message="Failed to load net income projection"
        onRetry={() => { refetch(); accountQuery.refetch(); }}
      />
    );
  }
  if (!data) return null;

  return (
    <View style={styles.tabContent}>
      <View style={styles.periodRow}>
        <TimePeriodSelector value={months} onChange={setMonths} />
      </View>

      {/* KPIs */}
      <Card>
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Overall Balance</Text>
            <Text style={[styles.kpiValue, { color: colors.primary }]}>
              {formatCurrencyFull(overallBalance)}
            </Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Monthly Income</Text>
            <Text style={[styles.kpiValue, { color: colors.success }]}>
              {formatCurrencyFull(data.monthlyIncome)}
            </Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Monthly Expenses</Text>
            <Text style={[styles.kpiValue, { color: colors.error }]}>
              {formatCurrencyFull(data.monthlyExpenses)}
            </Text>
          </View>
        </View>
      </Card>

      {/* Assets chart */}
      {assetAccounts.length > 0 && (
        <Card>
          <Text style={styles.chartTitle}>Assets</Text>
          <AccountBalanceChart
            accounts={assetAccounts}
            overall={accountData?.overall}
            months={months}
          />
        </Card>
      )}

      {/* Liabilities chart */}
      {liabilityAccounts.length > 0 && (
        <Card>
          <Text style={styles.chartTitle}>Liabilities</Text>
          <AccountBalanceChart
            accounts={liabilityAccounts}
            colorOffset={assetAccounts.length}
            months={months}
          />
        </Card>
      )}
    </View>
  );
}

function SavingsTab() {
  const { data, isLoading, error } = useSavingsAccounts();

  if (isLoading && !data) return <SkeletonChartCard height={200} />;
  if (error && !data) {
    return <ErrorCard message="Failed to load savings accounts" onRetry={() => {}} />;
  }
  if (!data || data.accounts.length === 0) {
    return <EmptyState message="Favorite a savings account to see projections" />;
  }

  // Sort favorites first
  const sorted = [...data.accounts].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return 0;
  });

  return (
    <View style={styles.tabContent}>
      {sorted.map((account) => (
        <SavingsProjectionCard key={account.accountId} account={account} />
      ))}
    </View>
  );
}

function DebtPayoffTab() {
  const [extraPayment, setExtraPayment] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [includeMortgages, setIncludeMortgages] = useState(true);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const accountsQuery = useDebtAccounts(true);
  const allAccounts = accountsQuery.data?.accounts ?? [];

  // Initialize selection once accounts load
  const effectiveIds = useMemo(() => {
    if (selectedIds !== null) return selectedIds;
    if (allAccounts.length === 0) return new Set<string>();
    // Default: all non-mortgage accounts
    return new Set(
      allAccounts
        .filter((a) => (includeMortgages ? true : !a.isMortgage))
        .map((a) => a.accountId),
    );
  }, [selectedIds, allAccounts, includeMortgages]);

  const { data, isLoading, error, refetch } = useDebtPayoff({
    extraPayment,
    includeMortgages: true,
    accountIds: effectiveIds.size > 0 ? Array.from(effectiveIds) : undefined,
    maxMonths: 360,
  });

  const toggleAccount = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev ?? effectiveIds);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [effectiveIds],
  );

  const toggleMortgages = useCallback(
    (value: boolean) => {
      setIncludeMortgages(value);
      setSelectedIds((prev) => {
        const next = new Set(prev ?? effectiveIds);
        for (const a of allAccounts) {
          if (a.isMortgage) {
            if (value) {
              next.add(a.accountId);
            } else {
              next.delete(a.accountId);
            }
          }
        }
        return next;
      });
    },
    [allAccounts, effectiveIds],
  );

  const loading = (isLoading && !data) || (accountsQuery.isLoading && !accountsQuery.data);
  if (loading) return <SkeletonChartCard height={250} />;
  if ((error || accountsQuery.error) && !data) {
    return (
      <ErrorCard
        message="Failed to load debt payoff projection"
        onRetry={() => { refetch(); accountsQuery.refetch(); }}
      />
    );
  }
  if (!data) return null;

  const selectedCount = effectiveIds.size;
  const totalCount = allAccounts.length;

  return (
    <View style={styles.tabContent}>
      {/* Controls */}
      <Card>
        <Slider
          label="Extra Monthly Payment"
          value={extraPayment}
          min={0}
          max={2000}
          step={50}
          onValueChange={setExtraPayment}
          formatValue={(v) => formatCurrencyFull(v)}
        />
      </Card>

      {/* Account selector */}
      <Card>
        <Pressable
          style={styles.accountPickerHeader}
          onPress={() => setShowAccountPicker(!showAccountPicker)}
        >
          <Text style={styles.accountPickerLabel}>
            Accounts ({selectedCount} of {totalCount})
          </Text>
          <MaterialCommunityIcons
            name={showAccountPicker ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.muted}
          />
        </Pressable>
        {showAccountPicker && (
          <View style={styles.accountPickerList}>
            {allAccounts.map((acct) => (
              <Pressable
                key={acct.accountId}
                style={styles.accountPickerRow}
                onPress={() => toggleAccount(acct.accountId)}
              >
                <MaterialCommunityIcons
                  name={
                    effectiveIds.has(acct.accountId)
                      ? "checkbox-marked"
                      : "checkbox-blank-outline"
                  }
                  size={20}
                  color={
                    effectiveIds.has(acct.accountId)
                      ? colors.primary
                      : colors.muted
                  }
                />
                <Text style={styles.accountPickerName} numberOfLines={1}>
                  {acct.name}
                </Text>
                <Text style={styles.accountPickerRate}>
                  {acct.interestRate.toFixed(1)}%
                </Text>
              </Pressable>
            ))}
            {allAccounts.some((a) => a.isMortgage) && (
              <View style={styles.mortgageToggleRow}>
                <Text style={styles.accountPickerName}>Include Mortgages</Text>
                <Switch
                  value={includeMortgages}
                  onValueChange={toggleMortgages}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
            )}
          </View>
        )}
      </Card>

      {/* KPIs */}
      <DebtStrategyToggle data={data} extraPayment={extraPayment} />

      {/* Avalanche chart */}
      <Card>
        <DebtPayoffChart
          result={data.avalanche}
          debtAccounts={data.debtAccounts}
          label="Avalanche"
          color={CHART_COLORS.liabilities}
        />
      </Card>

      {/* Snowball chart */}
      <Card>
        <DebtPayoffChart
          result={data.snowball}
          debtAccounts={data.debtAccounts}
          label="Snowball"
          color={CHART_COLORS.balance}
        />
      </Card>
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
  tabContent: {
    gap: spacing.md,
  },
  periodRow: {
    alignItems: "flex-end",
  },
  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  kpiItem: {
    alignItems: "center",
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  chartTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  accountPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  accountPickerLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  accountPickerList: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  accountPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  accountPickerName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  accountPickerRate: {
    color: colors.muted,
    fontSize: 12,
  },
  mortgageToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
