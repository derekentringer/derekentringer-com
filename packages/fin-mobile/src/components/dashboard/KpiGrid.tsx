import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { KpiCard } from "./KpiCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrency } from "@/lib/chartTheme";
import type {
  NetWorthResponse,
  IncomeSpendingResponse,
  SpendingSummary,
  DailySpendingResponse,
  DTIResponse,
} from "@derekentringer/shared/finance";
import { spacing } from "@/theme";

interface KpiGridProps {
  netWorth: NetWorthResponse | undefined;
  dailyNetWorth: NetWorthResponse | undefined;
  spending: SpendingSummary | undefined;
  dailySpending: DailySpendingResponse | undefined;
  mtdIncome: IncomeSpendingResponse | undefined;
  dti: DTIResponse | undefined;
  netWorthLoading: boolean;
  spendingLoading: boolean;
  incomeLoading: boolean;
  dtiLoading: boolean;
  netWorthError: string;
  spendingError: string;
  incomeError: string;
  dtiError: string;
  onRetryNetWorth: () => void;
  onRetrySpending: () => void;
  onRetryIncome: () => void;
  onRetryDti: () => void;
  onNetWorthPress: () => void;
  onIncomePress: () => void;
  onSpendingPress: () => void;
  onDtiPress: () => void;
}

function computeSparkline(
  data: number[],
  invertColor = false,
): { data: number[]; change: number; label: string; color: string; invertColor: boolean } | undefined {
  if (data.length < 2) return undefined;
  const first = data[0];
  const last = data[data.length - 1];
  const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  return {
    data,
    change,
    label: "30-Day",
    color: invertColor
      ? (change > 0 ? "#ef4444" : "#22c55e")
      : (change >= 0 ? "#22c55e" : "#ef4444"),
    invertColor,
  };
}

export function KpiGrid({
  netWorth,
  dailyNetWorth,
  spending,
  dailySpending,
  mtdIncome,
  dti,
  netWorthLoading,
  spendingLoading,
  incomeLoading,
  dtiLoading,
  netWorthError,
  spendingError,
  incomeError,
  dtiError,
  onRetryNetWorth,
  onRetrySpending,
  onRetryIncome,
  onRetryDti,
  onNetWorthPress,
  onIncomePress,
  onSpendingPress,
  onDtiPress,
}: KpiGridProps) {
  const allLoading = netWorthLoading && spendingLoading && incomeLoading && dtiLoading;

  if (allLoading) {
    return (
      <View style={styles.grid}>
        <View style={styles.row}>
          <SkeletonCard style={styles.cell} />
          <SkeletonCard style={styles.cell} />
        </View>
        <View style={styles.row}>
          <SkeletonCard style={styles.cell} />
          <SkeletonCard style={styles.cell} />
        </View>
      </View>
    );
  }

  // Net worth sparkline
  const netWorthSparkline = dailyNetWorth && dailyNetWorth.history.length >= 2
    ? computeSparkline(dailyNetWorth.history.map((p) => p.netWorth))
    : undefined;

  // Spending sparkline (cumulative)
  let spendingSparkline: typeof netWorthSparkline;
  if (dailySpending && dailySpending.points.length >= 2) {
    const cumulative: number[] = [];
    let sum = 0;
    for (const p of dailySpending.points) {
      sum += p.amount;
      cumulative.push(sum);
    }
    spendingSparkline = computeSparkline(cumulative, true);
    if (spendingSparkline) spendingSparkline.label = "MTD";
  }

  // Income sparkline (cumulative)
  const mtdIncomeTotal = mtdIncome
    ? mtdIncome.points.reduce((s, p) => s + p.income, 0)
    : 0;
  let incomeSparkline: typeof netWorthSparkline;
  if (mtdIncome && mtdIncome.points.length >= 2) {
    const cumulative: number[] = [];
    let sum = 0;
    for (const p of mtdIncome.points) {
      sum += p.income;
      cumulative.push(sum);
    }
    incomeSparkline = computeSparkline(cumulative);
    if (incomeSparkline) incomeSparkline.label = "MTD";
  }

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        {netWorthLoading ? (
          <SkeletonCard style={styles.cell} />
        ) : netWorthError ? (
          <View style={styles.cell}>
            <ErrorCard message={netWorthError} onRetry={onRetryNetWorth} />
          </View>
        ) : netWorth ? (
          <Pressable
            style={styles.cell}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onNetWorthPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Net Worth: ${formatCurrency(netWorth.summary.netWorth)}, tap for details`}
          >
            <KpiCard
              title="Net Worth"
              value={formatCurrency(netWorth.summary.netWorth)}
              sparkline={netWorthSparkline}
            />
          </Pressable>
        ) : <View style={styles.cell} />}

        {incomeLoading ? (
          <SkeletonCard style={styles.cell} />
        ) : incomeError ? (
          <View style={styles.cell}>
            <ErrorCard message={incomeError} onRetry={onRetryIncome} />
          </View>
        ) : (
          <Pressable
            style={styles.cell}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onIncomePress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Monthly Income: ${formatCurrency(mtdIncomeTotal)}, tap for details`}
          >
            <KpiCard
              title="Monthly Income"
              value={formatCurrency(mtdIncomeTotal)}
              sparkline={incomeSparkline}
            />
          </Pressable>
        )}
      </View>
      <View style={styles.row}>
        {spendingLoading ? (
          <SkeletonCard style={styles.cell} />
        ) : spendingError ? (
          <View style={styles.cell}>
            <ErrorCard message={spendingError} onRetry={onRetrySpending} />
          </View>
        ) : spending ? (
          <Pressable
            style={styles.cell}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSpendingPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Monthly Spending: ${formatCurrency(spending.total)}, tap for details`}
          >
            <KpiCard
              title="Monthly Spending"
              value={formatCurrency(spending.total)}
              sparkline={spendingSparkline}
            />
          </Pressable>
        ) : <View style={styles.cell} />}

        {dtiLoading ? (
          <SkeletonCard style={styles.cell} />
        ) : dtiError ? (
          <View style={styles.cell}>
            <ErrorCard message={dtiError} onRetry={onRetryDti} />
          </View>
        ) : dti ? (
          <Pressable
            style={styles.cell}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDtiPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`DTI: ${dti.ratio.toFixed(1)}%, tap for details`}
          >
            <KpiCard
              title="DTI"
              value={`${dti.ratio.toFixed(1)}%`}
              trend={{
                direction: dti.ratio > 43 ? "up" : dti.ratio > 36 ? "neutral" : "down",
                value: dti.ratio > 43 ? "High" : dti.ratio > 36 ? "Moderate" : "Good",
                invertColor: true,
              }}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
  },
});
