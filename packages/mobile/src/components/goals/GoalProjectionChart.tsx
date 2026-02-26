import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { GoalType, GoalProgressPoint } from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

const GOAL_TYPE_COLORS: Record<GoalType, string> = {
  savings: "#22c55e",
  debt_payoff: "#ef4444",
  net_worth: "#2563eb",
  custom: "#f59e0b",
};

const Y_AXIS_WIDTH = 40;
const CHART_WIDTH_FULL = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;
const CHART_WIDTH_MINI = Dimensions.get("window").width - 64;

interface GoalProjectionChartProps {
  projection: GoalProgressPoint[];
  goalType: GoalType;
  targetAmount: number;
  mini?: boolean;
}

export function GoalProjectionChart({
  projection,
  goalType,
  targetAmount,
  mini = false,
}: GoalProjectionChartProps) {
  const typeColor = GOAL_TYPE_COLORS[goalType];

  const { projectedData, actualData, xLabels, chartMax } = useMemo(() => {
    if (!projection || projection.length === 0) {
      return { projectedData: [], actualData: [], xLabels: [], chartMax: undefined };
    }

    const projected = projection.map((p) => ({
      value: p.projected,
      label: "",
    }));

    const actual = projection.map((p) => ({
      value: p.actual ?? p.projected,
      label: "",
    }));

    const labels: string[] = [];
    if (!mini) {
      const step = Math.max(1, Math.ceil(projection.length / 5));
      for (let i = 0; i < projection.length; i++) {
        if (i % step === 0) {
          const d = new Date(projection[i].month + "-15");
          labels.push(
            d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          );
        } else {
          labels.push("");
        }
      }
    }

    const allValues = projection.flatMap((p) => [
      p.projected,
      p.actual ?? 0,
      p.target,
    ]);
    const max = Math.max(...allValues, targetAmount) * 1.1;

    return { projectedData: projected, actualData: actual, xLabels: labels, chartMax: max };
  }, [projection, targetAmount, mini]);

  const actualWithLabels = useMemo(() => {
    return actualData.map((p, i) => ({
      ...p,
      label: xLabels[i] ?? "",
    }));
  }, [actualData, xLabels]);

  if (projectedData.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No projection data</Text>
      </View>
    );
  }

  const referenceValue = goalType === "debt_payoff" ? 0 : targetAmount;

  if (mini) {
    return (
      <View style={styles.miniContainer}>
        <LineChart
          data={actualWithLabels}
          data2={projectedData}
          width={CHART_WIDTH_MINI}
          height={80}
          color={typeColor}
          color2={colors.muted}
          thickness={1.5}
          thickness2={1}
          hideDataPoints
          hideDataPoints2
          curved
          areaChart
          startFillColor={typeColor}
          startOpacity={0.15}
          endOpacity={0}
          startFillColor2="transparent"
          startOpacity2={0}
          endOpacity2={0}
          hideYAxisText
          hideAxesAndRules
          disableScroll
          adjustToWidth
          isAnimated={false}
          maxValue={chartMax}
        />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.chartContainer}>
        <LineChart
          data={actualWithLabels}
          data2={projectedData}
          width={CHART_WIDTH_FULL}
          height={220}
          color={typeColor}
          color2={colors.muted}
          thickness={1.5}
          thickness2={1}
          hideDataPoints
          hideDataPoints2
          curved
          areaChart
          startFillColor={typeColor}
          startOpacity={0.15}
          endOpacity={0}
          startFillColor2="transparent"
          startOpacity2={0}
          endOpacity2={0}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          rulesColor={CHART_COLORS.grid}
          yAxisColor="transparent"
          xAxisColor="transparent"
          formatYLabel={(v) => formatCurrency(Number(v))}
          noOfSections={4}
          maxValue={chartMax}
          disableScroll
          adjustToWidth
          isAnimated={false}
          showReferenceLine1
          referenceLine1Position={referenceValue}
          referenceLine1Config={{
            color: typeColor,
            dashWidth: 4,
            dashGap: 4,
            thickness: 1,
          }}
        />
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: typeColor }]} />
          <Text style={styles.legendText}>Actual</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.muted }]} />
          <Text style={styles.legendText}>Projected</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor: typeColor,
                borderRadius: 0,
                height: 2,
                width: 12,
              },
            ]}
          />
          <Text style={styles.legendText}>
            {goalType === "debt_payoff" ? "Zero" : "Target"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  miniContainer: {
    overflow: "hidden",
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
  empty: {
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
  },
});
