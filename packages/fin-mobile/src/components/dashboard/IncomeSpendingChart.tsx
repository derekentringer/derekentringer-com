import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { TimeRangeSelector } from "./TimeRangeSelector";
import { useIncomeSpending } from "@/hooks/useDashboard";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import { colors, spacing } from "@/theme";

const Y_AXIS_WIDTH = 40;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

export function IncomeSpendingChart() {
  const [range, setRange] = useState<ChartTimeRange>("12m");
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("monthly");

  const { data, isLoading, error, refetch } = useIncomeSpending(range, granularity, "sources");

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.points.map((p, i) => {
      const label = formatLabel(p.date, granularity);
      const showLabel = data.points.length <= 6 ||
        i % Math.ceil(data.points.length / 5) === 0;
      return {
        value: p.income,
        frontColor: CHART_COLORS.income,
        label: showLabel ? label : "",
        spacing: 2,
        stacks: [
          { value: p.income, color: CHART_COLORS.income },
          { value: p.spending, color: CHART_COLORS.expenses },
        ],
      };
    });
  }, [data, granularity]);

  // For grouped bar chart, we need paired items
  const groupedData = useMemo(() => {
    if (!data) return [];
    const items: Array<{
      value: number;
      frontColor: string;
      label?: string;
      spacing?: number;
    }> = [];
    data.points.forEach((p, i) => {
      const label = formatLabel(p.date, granularity);
      const showLabel = data.points.length <= 6 ||
        i % Math.ceil(data.points.length / 5) === 0;
      items.push({
        value: p.income,
        frontColor: CHART_COLORS.income,
        label: showLabel ? label : "",
        spacing: 2,
      });
      items.push({
        value: p.spending,
        frontColor: CHART_COLORS.expenses,
        spacing: 12,
      });
    });
    return items;
  }, [data, granularity]);

  const barMaxValue = useMemo(() => {
    if (!data) return undefined;
    const max = Math.max(...data.points.flatMap((p) => [p.income, p.spending]));
    return max * 1.1;
  }, [data]);

  const handleRangeChange = useCallback((r: ChartTimeRange) => setRange(r), []);
  const handleGranularityChange = useCallback((g: ChartGranularity) => {
    if (g === "weekly" || g === "monthly") setGranularity(g);
  }, []);

  if (isLoading && !data) return <SkeletonChartCard height={250} />;
  if (error && !data) return <ErrorCard message="Failed to load income vs spending" onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Income vs Spending</Text>
        <TimeRangeSelector
          range={range}
          granularity={granularity}
          onRangeChange={handleRangeChange}
          onGranularityChange={handleGranularityChange}
        />
      </View>
      <View
        style={[styles.chartContainer, isLoading && styles.loading]}
        accessibilityLabel={`Income vs spending chart showing ${data.points.length} periods`}
      >
        {groupedData.length > 0 && (
          <BarChart
            data={groupedData}
            width={CHART_WIDTH}
            height={220}
            barWidth={8}
            noOfSections={4}
            maxValue={barMaxValue}
            yAxisLabelWidth={Y_AXIS_WIDTH}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            rulesColor={CHART_COLORS.grid}
            yAxisColor="transparent"
            xAxisColor="transparent"
            formatYLabel={(v) => formatCurrency(Number(v))}
            disableScroll
            disablePress
            adjustToWidth
            isAnimated={false}
          />
        )}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.income }]} />
          <Text style={styles.legendText}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.expenses }]} />
          <Text style={styles.legendText}>Spending</Text>
        </View>
      </View>
    </Card>
  );
}

function formatLabel(date: string, granularity: "weekly" | "monthly"): string {
  if (granularity === "weekly") {
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return new Date(date + "-15").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  chartContainer: {},
  loading: {
    opacity: 0.4,
  },
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
