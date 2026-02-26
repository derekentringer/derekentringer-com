import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { AccountProjectionLine, AccountProjectionPoint } from "@derekentringer/shared/finance";
import { CHART_COLORS, getCategoryColor, formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

const Y_AXIS_WIDTH = 50;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

interface AccountBalanceChartProps {
  accounts: AccountProjectionLine[];
  overall?: AccountProjectionPoint[];
  colorOffset?: number;
  months: number;
}

export function AccountBalanceChart({
  accounts,
  overall,
  colorOffset = 0,
  months,
}: AccountBalanceChartProps) {
  const dataSet = useMemo(() => {
    const sets: Array<{
      data: Array<{ value: number; label: string }>;
      color: string;
      thickness: number;
      startFillColor: string;
      startOpacity: number;
      endOpacity: number;
    }> = [];

    for (let i = 0; i < accounts.length; i++) {
      const acct = accounts[i];
      const lineColor = getCategoryColor(colorOffset + i);
      sets.push({
        data: acct.projection.slice(0, months).map((p) => ({
          value: p.balance,
          label: "",
        })),
        color: lineColor,
        thickness: 1.5,
        startFillColor: lineColor,
        startOpacity: 0.15,
        endOpacity: 0,
      });
    }

    if (overall) {
      sets.push({
        data: overall.slice(0, months).map((p) => ({
          value: p.balance,
          label: "",
        })),
        color: CHART_COLORS.balance,
        thickness: 2,
        startFillColor: CHART_COLORS.balance,
        startOpacity: 0.15,
        endOpacity: 0,
      });
    }

    return sets;
  }, [accounts, overall, colorOffset, months]);

  const xLabels = useMemo(() => {
    const source = overall ?? accounts[0]?.projection ?? [];
    const sliced = source.slice(0, months);
    if (sliced.length <= 6) {
      return sliced.map((p) => formatMonthLabel(p.month));
    }
    const step = Math.ceil(sliced.length / 5);
    return sliced.map((p, i) =>
      i % step === 0 ? formatMonthLabel(p.month) : "",
    );
  }, [overall, accounts, months]);

  const primaryDataWithLabels = useMemo(() => {
    if (dataSet.length === 0) return [];
    return dataSet[0].data.map((p, i) => ({
      ...p,
      label: xLabels[i] ?? "",
    }));
  }, [dataSet, xLabels]);

  const chartMaxValue = useMemo(() => {
    let max = 0;
    for (const set of dataSet) {
      for (const point of set.data) {
        if (point.value > max) max = point.value;
      }
    }
    return max * 1.1 || 100;
  }, [dataSet]);

  if (dataSet.length === 0) return null;

  const remainingSets = dataSet.slice(1).map((set) => ({
    ...set,
    data: set.data.map((p) => ({ ...p, label: "" })),
  }));

  return (
    <View>
      <View style={styles.chartContainer}>
        <LineChart
          data={primaryDataWithLabels}
          dataSet={remainingSets.length > 0 ? remainingSets : undefined}
          width={CHART_WIDTH}
          height={220}
          color={dataSet[0].color}
          thickness={dataSet[0].thickness}
          hideDataPoints
          curved
          areaChart
          startFillColor={dataSet[0].startFillColor}
          startOpacity={dataSet[0].startOpacity}
          endOpacity={dataSet[0].endOpacity}
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
        {accounts.map((acct, i) => (
          <View key={acct.accountId} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: getCategoryColor(colorOffset + i) },
              ]}
            />
            <Text style={styles.legendText} numberOfLines={1}>
              {acct.accountName}
            </Text>
          </View>
        ))}
        {overall && (
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: CHART_COLORS.balance },
              ]}
            />
            <Text style={styles.legendText}>Overall</Text>
          </View>
        )}
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
