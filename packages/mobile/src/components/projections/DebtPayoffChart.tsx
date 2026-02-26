import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { CHART_COLORS, getCategoryColor, formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";
import type {
  DebtPayoffStrategyResult,
  DebtAccountSummary,
} from "@derekentringer/shared/finance";

const Y_AXIS_WIDTH = 50;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

interface DebtPayoffChartProps {
  result: DebtPayoffStrategyResult;
  debtAccounts: DebtAccountSummary[];
  label: string;
  color: string;
}

export function DebtPayoffChart({
  result,
  debtAccounts,
  label,
  color,
}: DebtPayoffChartProps) {
  const schedule = result.aggregateSchedule;

  // Build per-account balance lookup from timelines
  const accountBalances = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const timeline of result.timelines) {
      map.set(
        timeline.accountId,
        timeline.schedule.map((p) => p.balance),
      );
    }
    return map;
  }, [result.timelines]);

  // Primary data = first account (with x-axis labels)
  // dataSet = remaining accounts + total line
  const { primaryData, dataSetItems, legendItems } = useMemo(() => {
    const accounts = debtAccounts.filter((a) =>
      accountBalances.has(a.accountId),
    );
    const monthCount = schedule.length;

    const allSets: Array<{
      data: Array<{ value: number; label: string }>;
      color: string;
      thickness: number;
      startFillColor: string;
      startOpacity: number;
      endOpacity: number;
      name: string;
    }> = [];

    // Per-account lines
    for (let i = 0; i < accounts.length; i++) {
      const acct = accounts[i];
      const balances = accountBalances.get(acct.accountId) ?? [];
      const lineColor = getCategoryColor(i);
      allSets.push({
        data: Array.from({ length: monthCount }, (_, j) => ({
          value: balances[j] ?? 0,
          label: "",
        })),
        color: lineColor,
        thickness: 1.5,
        startFillColor: lineColor,
        startOpacity: 0.1,
        endOpacity: 0,
        name: acct.name,
      });
    }

    // Total balance line
    allSets.push({
      data: schedule.map((p) => ({
        value: p.totalBalance,
        label: "",
      })),
      color,
      thickness: 2,
      startFillColor: color,
      startOpacity: 0.15,
      endOpacity: 0,
      name: "Total",
    });

    const xLabels = buildXLabels(schedule.map((p) => p.month));

    const first = allSets[0];
    const primary = first.data.map((p, i) => ({
      ...p,
      label: xLabels[i] ?? "",
    }));

    const rest = allSets.slice(1).map((set) => ({
      data: set.data,
      color: set.color,
      thickness: set.thickness,
      startFillColor: set.startFillColor,
      startOpacity: set.startOpacity,
      endOpacity: set.endOpacity,
    }));

    const legend = allSets.map((set) => ({
      name: set.name,
      color: set.color,
    }));

    return { primaryData: primary, dataSetItems: rest, legendItems: legend };
  }, [schedule, debtAccounts, accountBalances, color]);

  const chartMaxValue = useMemo(() => {
    const max = Math.max(...schedule.map((p) => p.totalBalance));
    return max * 1.1 || 100;
  }, [schedule]);

  if (schedule.length === 0) return null;

  return (
    <View>
      <Text style={styles.title}>{label}</Text>
      <View style={styles.chartContainer}>
        <LineChart
          data={primaryData}
          dataSet={dataSetItems.length > 0 ? dataSetItems : undefined}
          width={CHART_WIDTH}
          height={220}
          color={legendItems[0]?.color ?? color}
          thickness={1.5}
          hideDataPoints
          curved
          areaChart
          startFillColor={legendItems[0]?.color ?? color}
          startOpacity={0.1}
          endOpacity={0}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          rulesColor={CHART_COLORS.grid}
          yAxisColor="transparent"
          xAxisColor="transparent"
          formatYLabel={(v: string) => formatCurrency(Number(v))}
          noOfSections={4}
          maxValue={chartMaxValue}
          disableScroll
          adjustToWidth
          isAnimated={false}
        />
      </View>
      <View style={styles.legendRow}>
        {legendItems.map((item) => (
          <View key={item.name} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: item.color }]}
            />
            <Text style={styles.legendText} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function buildXLabels(months: string[]): string[] {
  if (months.length <= 6) {
    return months.map(formatMonthLabel);
  }
  const step = Math.ceil(months.length / 5);
  return months.map((m, i) => (i % step === 0 ? formatMonthLabel(m) : ""));
}

function formatMonthLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "short",
  });
}

const styles = StyleSheet.create({
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  chartContainer: {
    marginTop: spacing.xs,
  },
  axisText: {
    color: colors.muted,
    fontSize: 9,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.muted,
    fontSize: 10,
    maxWidth: 80,
  },
});
