import React, { useMemo } from "react";
import { View, Dimensions, StyleSheet } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { useAccountBalanceHistory } from "@/hooks/useDashboard";
import { CATEGORY_COLORS, formatCurrency } from "@/lib/chartTheme";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import { colors, spacing } from "@/theme";

interface BalanceHistoryChartProps {
  accountId: string;
  range: ChartTimeRange;
  granularity: ChartGranularity;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

function getAccountColor(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) | 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return formatCurrency(value);
}

export function BalanceHistoryChart({
  accountId,
  range,
  granularity,
}: BalanceHistoryChartProps) {
  const { data, isLoading, error, refetch } = useAccountBalanceHistory(
    accountId,
    range,
    granularity,
  );

  const chartData = useMemo(() => {
    if (!data?.history) return [];
    const step = Math.max(1, Math.floor(data.history.length / 6));
    return data.history.map((p, i) => ({
      value: p.balance,
      label: i % step === 0 ? p.date.slice(5) : "",
    }));
  }, [data]);

  if (isLoading) return <SkeletonCard lines={1} />;
  if (error) return <ErrorCard message="Failed to load chart" onRetry={() => refetch()} />;
  if (!data || chartData.length < 2) return null;

  const yAxisWidth = 40;
  const chartWidth = SCREEN_WIDTH - 32 - yAxisWidth;
  const lineColor = getAccountColor(accountId);

  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = Math.max((maxVal - minVal) * 0.1, 1);
  const yAxisOffset = Math.floor(minVal - padding);
  const chartMaxValue = Math.ceil(maxVal + padding) - yAxisOffset;

  return (
    <View style={styles.container}>
      <LineChart
        data={chartData}
        width={chartWidth}
        height={160}
        hideDataPoints
        curved
        thickness={2}
        color={lineColor}
        areaChart
        startFillColor={lineColor}
        startOpacity={0.15}
        endOpacity={0}
        yAxisOffset={yAxisOffset}
        maxValue={chartMaxValue}
        yAxisLabelWidth={yAxisWidth}
        yAxisTextStyle={styles.yAxisText}
        xAxisLabelTextStyle={styles.xAxisText}
        rulesColor={colors.border}
        yAxisColor="transparent"
        xAxisColor={colors.border}
        disableScroll
        adjustToWidth
        isAnimated={false}
        formatYLabel={(val) => formatCompact(Number(val))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  yAxisText: {
    color: colors.muted,
    fontSize: 10,
  },
  xAxisText: {
    color: colors.muted,
    fontSize: 10,
  },
});
