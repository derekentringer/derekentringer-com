import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";
import type { NetIncomeProjectionPoint } from "@derekentringer/shared/finance";

const Y_AXIS_WIDTH = 40;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

interface NetIncomeProjectionChartProps {
  projection: NetIncomeProjectionPoint[];
}

export function NetIncomeProjectionChart({ projection }: NetIncomeProjectionChartProps) {
  const incomeData = useMemo(() => {
    return projection.map((p) => ({ value: p.income, label: "" }));
  }, [projection]);

  const expensesData = useMemo(() => {
    return projection.map((p) => ({ value: p.expenses, label: "" }));
  }, [projection]);

  const xLabels = useMemo(() => {
    if (projection.length <= 6) {
      return projection.map((p) => formatMonthLabel(p.month));
    }
    const step = Math.ceil(projection.length / 5);
    return projection.map((p, i) =>
      i % step === 0 ? formatMonthLabel(p.month) : ""
    );
  }, [projection]);

  const incomeWithLabels = useMemo(() => {
    return incomeData.map((p, i) => ({
      ...p,
      label: xLabels[i] ?? "",
    }));
  }, [incomeData, xLabels]);

  const chartMaxValue = useMemo(() => {
    const allValues = projection.flatMap((p) => [p.income, p.expenses]);
    const max = Math.max(...allValues);
    return max * 1.1;
  }, [projection]);

  if (projection.length === 0) return null;

  return (
    <View>
      <View style={styles.chartContainer}>
        <LineChart
          data={incomeWithLabels}
          data2={expensesData}
          width={CHART_WIDTH}
          height={220}
          color={CHART_COLORS.income}
          color2={CHART_COLORS.expenses}
          thickness={1.5}
          thickness2={1.5}
          hideDataPoints
          hideDataPoints2
          curved
          areaChart
          startFillColor={CHART_COLORS.income}
          startFillColor2={CHART_COLORS.expenses}
          startOpacity={0.15}
          startOpacity2={0.15}
          endOpacity={0}
          endOpacity2={0}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          rulesColor={CHART_COLORS.grid}
          yAxisColor="transparent"
          xAxisColor="transparent"
          formatYLabel={(v) => formatCurrency(Number(v))}
          noOfSections={4}
          maxValue={chartMaxValue}
          disableScroll
          adjustToWidth
          isAnimated={false}
        />
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.income }]} />
          <Text style={styles.legendText}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.expenses }]} />
          <Text style={styles.legendText}>Expenses</Text>
        </View>
      </View>
    </View>
  );
}

function formatMonthLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "short",
  });
}

const styles = StyleSheet.create({
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
