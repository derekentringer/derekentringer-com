import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { useSavingsProjection } from "@/hooks/useProjections";
import { CHART_COLORS, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";
import type { SavingsAccountSummary } from "@derekentringer/shared/finance";

const Y_AXIS_WIDTH = 40;
const CHART_WIDTH = Dimensions.get("window").width - 64 - Y_AXIS_WIDTH;

interface SavingsProjectionCardProps {
  account: SavingsAccountSummary;
}

export function SavingsProjectionCard({ account }: SavingsProjectionCardProps) {
  const { data, isLoading, error } = useSavingsProjection(account.accountId, { months: 12 });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.projection.map((p) => ({ value: p.balance, label: "" }));
  }, [data]);

  const xLabels = useMemo(() => {
    if (!data) return [];
    const pts = data.projection;
    if (pts.length <= 6) {
      return pts.map((p) => formatMonthLabel(p.month));
    }
    const step = Math.ceil(pts.length / 5);
    return pts.map((p, i) =>
      i % step === 0 ? formatMonthLabel(p.month) : ""
    );
  }, [data]);

  const dataWithLabels = useMemo(() => {
    return chartData.map((p, i) => ({
      ...p,
      label: xLabels[i] ?? "",
    }));
  }, [chartData, xLabels]);

  const chartMaxValue = useMemo(() => {
    if (!data) return undefined;
    const max = Math.max(...data.projection.map((p) => p.balance));
    return max * 1.1;
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <SkeletonChartCard height={120} />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <Text style={styles.errorText}>Failed to load projection</Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.accountName} numberOfLines={1}>
          {account.accountName}
        </Text>
        <View style={styles.apyBadge}>
          <Text style={styles.apyBadgeText}>{account.apy.toFixed(2)}% APY</Text>
        </View>
      </View>
      <Text style={styles.currentBalance}>
        {formatCurrencyFull(account.currentBalance)}
      </Text>
      {dataWithLabels.length > 0 && (
        <View style={styles.chartContainer}>
          <LineChart
            data={dataWithLabels}
            width={CHART_WIDTH}
            height={120}
            color={CHART_COLORS.balance}
            thickness={1.5}
            hideDataPoints
            curved
            areaChart
            startFillColor={CHART_COLORS.balance}
            startOpacity={0.15}
            endOpacity={0}
            yAxisLabelWidth={Y_AXIS_WIDTH}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            rulesColor={CHART_COLORS.grid}
            yAxisColor="transparent"
            xAxisColor="transparent"
            formatYLabel={(v) => formatCurrency(Number(v))}
            noOfSections={3}
            maxValue={chartMaxValue}
            disableScroll
            adjustToWidth
            isAnimated={false}
          />
        </View>
      )}
    </Card>
  );
}

function formatMonthLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "short",
  });
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  accountName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: spacing.sm,
  },
  apyBadge: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  apyBadgeText: {
    color: CHART_COLORS.balance,
    fontSize: 10,
    fontWeight: "600",
  },
  currentBalance: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  chartContainer: {
    marginTop: spacing.xs,
  },
  axisText: {
    color: colors.muted,
    fontSize: 9,
  },
  errorText: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: spacing.lg,
    fontSize: 13,
  },
});
