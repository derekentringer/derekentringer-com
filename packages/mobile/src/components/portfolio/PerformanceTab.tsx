import React, { useState, useMemo } from "react";
import { View, Text, Pressable, Dimensions, StyleSheet } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { PerformancePeriod } from "@derekentringer/shared/finance";
import { usePerformance } from "@/hooks/usePortfolio";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import { CHART_COLORS, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface PerformanceTabProps {
  accountId?: string;
}

const PERIODS: Array<{ value: PerformancePeriod; label: string }> = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
  { value: "all", label: "All" },
];

const Y_AXIS_WIDTH = 50;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

export function PerformanceTab({ accountId }: PerformanceTabProps) {
  const [period, setPeriod] = useState<PerformancePeriod>("12m");
  const { data, isLoading, error, refetch } = usePerformance(
    period,
    accountId,
  );

  const chartData = useMemo(() => {
    if (!data?.series) return { portfolio: [], benchmark: [] };
    const step = data.series.length > 60 ? Math.ceil(data.series.length / 60) : 1;
    const sampled = data.series.filter((_, i) => i % step === 0);
    const portfolio = sampled.map((p, i) => ({
      value: p.portfolioValue,
      label: i % Math.ceil(sampled.length / 5) === 0 ? formatDateLabel(p.date) : "",
    }));
    const benchmark = sampled.map((p) => ({
      value: p.benchmarkValue ?? 0,
      label: "",
    }));
    return { portfolio, benchmark };
  }, [data]);

  const chartMaxValue = useMemo(() => {
    let max = 0;
    for (const p of chartData.portfolio) {
      if (p.value > max) max = p.value;
    }
    for (const p of chartData.benchmark) {
      if (p.value > max) max = p.value;
    }
    return max * 1.1 || 100;
  }, [chartData]);

  if (isLoading && !data) return <SkeletonChartCard height={300} />;
  if (error && !data) {
    return (
      <ErrorCard
        message="Failed to load performance"
        onRetry={() => refetch()}
      />
    );
  }
  if (!data) return <EmptyState message="No performance data available" />;

  const summary = data.summary;

  return (
    <View style={styles.container}>
      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.value}
            style={[styles.periodChip, period === p.value && styles.periodChipActive]}
            onPress={() => setPeriod(p.value)}
          >
            <Text
              style={[
                styles.periodChipText,
                period === p.value && styles.periodChipTextActive,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* KPI Cards */}
      <Card>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Total Value</Text>
            <Text style={[styles.kpiValue, { color: colors.primary }]}>
              {formatCurrencyFull(summary.totalValue)}
            </Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Total Return</Text>
            <Text
              style={[
                styles.kpiValue,
                {
                  color:
                    summary.totalReturn >= 0
                      ? colors.success
                      : colors.error,
                },
              ]}
            >
              {formatCurrencyFull(summary.totalReturn)}
            </Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Return %</Text>
            <Text
              style={[
                styles.kpiValue,
                {
                  color:
                    summary.totalReturnPct >= 0
                      ? colors.success
                      : colors.error,
                },
              ]}
            >
              {summary.totalReturnPct >= 0 ? "+" : ""}
              {summary.totalReturnPct.toFixed(2)}%
            </Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Benchmark (SPY)</Text>
            <Text
              style={[
                styles.kpiValue,
                {
                  color:
                    (summary.benchmarkReturnPct ?? 0) >= 0
                      ? colors.success
                      : colors.error,
                },
              ]}
            >
              {(summary.benchmarkReturnPct ?? 0) >= 0 ? "+" : ""}
              {(summary.benchmarkReturnPct ?? 0).toFixed(2)}%
            </Text>
          </View>
        </View>
      </Card>

      {/* Chart */}
      {chartData.portfolio.length > 0 ? (
        <Card>
          <Text style={styles.chartTitle}>Performance</Text>
          <View style={styles.chartContainer}>
            <LineChart
              data={chartData.portfolio}
              dataSet={[
                {
                  data: chartData.benchmark,
                  color: colors.muted,
                  thickness: 1,
                },
              ]}
              width={CHART_WIDTH}
              height={220}
              color={CHART_COLORS.netWorth}
              thickness={2}
              hideDataPoints
              curved
              areaChart
              startFillColor={CHART_COLORS.netWorth}
              startOpacity={0.15}
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
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: CHART_COLORS.netWorth },
                ]}
              />
              <Text style={styles.legendText}>Portfolio</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: colors.muted },
                ]}
              />
              <Text style={styles.legendText}>Benchmark</Text>
            </View>
          </View>
        </Card>
      ) : (
        <EmptyState message="No historical price data available. Chart requires price history for holdings with tickers." />
      )}
    </View>
  );
}

function formatDateLabel(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short" });
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  periodRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  periodChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  periodChipTextActive: {
    color: colors.foreground,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  kpiItem: {
    width: "48%",
    alignItems: "center",
    marginBottom: spacing.sm,
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
  chartContainer: {},
  axisText: {
    color: colors.muted,
    fontSize: 9,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
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
  },
});
