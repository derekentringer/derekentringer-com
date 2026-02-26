import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { TimeRangeSelector } from "./TimeRangeSelector";
import { useNetWorth } from "@/hooks/useDashboard";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import { colors, spacing } from "@/theme";

const CHART_WIDTH = Dimensions.get("window").width - 80;

export function NetWorthChart() {
  const [range, setRange] = useState<ChartTimeRange>("12m");
  const [granularity, setGranularity] = useState<ChartGranularity>("weekly");

  const { data, isLoading, error, refetch } = useNetWorth(range, granularity);

  const chartData = useMemo(() => {
    if (!data) return { assets: [], liabilities: [], netWorth: [] };
    return {
      assets: data.history.map((p) => ({ value: p.assets, label: "" })),
      liabilities: data.history.map((p) => ({ value: p.liabilities, label: "" })),
      netWorth: data.history.map((p) => ({
        value: p.netWorth,
        label: "",
        dataPointText: "",
      })),
    };
  }, [data]);

  const xLabels = useMemo(() => {
    if (!data) return [];
    const pts = data.history;
    if (pts.length <= 6) {
      return pts.map((p) => formatLabel(p.date, granularity));
    }
    const step = Math.ceil(pts.length / 5);
    return pts.map((p, i) =>
      i % step === 0 ? formatLabel(p.date, granularity) : ""
    );
  }, [data, granularity]);

  // Add labels to the netWorth dataset for x-axis
  const netWorthWithLabels = useMemo(() => {
    return chartData.netWorth.map((p, i) => ({
      ...p,
      label: xLabels[i] ?? "",
    }));
  }, [chartData.netWorth, xLabels]);

  const handleRangeChange = useCallback((r: ChartTimeRange) => setRange(r), []);
  const handleGranularityChange = useCallback((g: ChartGranularity) => setGranularity(g), []);

  if (isLoading && !data) return <SkeletonChartCard height={250} />;
  if (error && !data) return <ErrorCard message="Failed to load net worth" onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Net Worth</Text>
        <TimeRangeSelector
          range={range}
          granularity={granularity}
          onRangeChange={handleRangeChange}
          onGranularityChange={handleGranularityChange}
        />
      </View>
      <View
        style={[styles.chartContainer, isLoading && styles.loading]}
        accessibilityLabel={`Net worth chart showing ${data.history.length} data points`}
      >
        {netWorthWithLabels.length > 0 && (
          <LineChart
            data={netWorthWithLabels}
            data2={chartData.assets}
            data3={chartData.liabilities}
            width={CHART_WIDTH}
            height={220}
            color={CHART_COLORS.netWorth}
            color2={CHART_COLORS.assets}
            color3={CHART_COLORS.liabilities}
            thickness={1.5}
            thickness2={1.5}
            thickness3={1.5}
            hideDataPoints
            hideDataPoints2
            hideDataPoints3
            curved
            areaChart
            startFillColor={CHART_COLORS.netWorth}
            startFillColor2={CHART_COLORS.assets}
            startFillColor3={CHART_COLORS.liabilities}
            startOpacity={0.15}
            startOpacity2={0.15}
            startOpacity3={0.15}
            endOpacity={0}
            endOpacity2={0}
            endOpacity3={0}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            rulesColor={CHART_COLORS.grid}
            yAxisColor="transparent"
            xAxisColor="transparent"
            formatYLabel={(v) => formatCurrency(Number(v))}
            noOfSections={4}
            disableScroll
            adjustToWidth
            isAnimated={false}
            pointerConfig={{
              pointerStripColor: colors.muted,
              pointerStripWidth: 1,
              pointerColor: CHART_COLORS.netWorth,
              radius: 4,
              pointerLabelWidth: 120,
              pointerLabelHeight: 60,
              pointerLabelComponent: (items: Array<{ value: number }>) => {
                return (
                  <View style={styles.tooltip}>
                    <Text style={[styles.tooltipText, { color: CHART_COLORS.netWorth }]}>
                      NW: {formatCurrency(items[0]?.value ?? 0)}
                    </Text>
                  </View>
                );
              },
            }}
          />
        )}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.netWorth }]} />
          <Text style={styles.legendText}>Net Worth</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.assets }]} />
          <Text style={styles.legendText}>Assets</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.liabilities }]} />
          <Text style={styles.legendText}>Liabilities</Text>
        </View>
      </View>
    </Card>
  );
}

function formatLabel(date: string, granularity: ChartGranularity): string {
  if (granularity === "weekly" || granularity === "daily") {
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
  chartContainer: {
    marginLeft: -16,
  },
  loading: {
    opacity: 0.4,
  },
  axisText: {
    color: colors.muted,
    fontSize: 9,
  },
  tooltip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 6,
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: "500",
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
