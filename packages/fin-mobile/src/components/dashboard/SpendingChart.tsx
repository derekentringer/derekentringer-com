import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { Card } from "@/components/common/Card";
import { SectionHeader } from "@/components/common/SectionHeader";
import { getCategoryColor, formatCurrencyFull } from "@/lib/chartTheme";
import type { SpendingSummary } from "@derekentringer/shared/finance";
import { colors, spacing, borderRadius } from "@/theme";

interface SpendingChartProps {
  data: SpendingSummary;
}

export function SpendingChart({ data }: SpendingChartProps) {
  const chartData = useMemo(() => {
    if (data.categories.length <= 7) {
      return data.categories.map((c, i) => ({
        value: c.amount,
        color: getCategoryColor(i),
        text: c.category,
      }));
    }
    const top6 = data.categories.slice(0, 6);
    const otherTotal = data.categories.slice(6).reduce((s, c) => s + c.amount, 0);
    return [
      ...top6.map((c, i) => ({
        value: c.amount,
        color: getCategoryColor(i),
        text: c.category,
      })),
      {
        value: Math.round(otherTotal * 100) / 100,
        color: "#64748b",
        text: "Other",
      },
    ];
  }, [data.categories]);

  if (data.total === 0) {
    return (
      <Card>
        <SectionHeader title="Spending" />
        <Text style={styles.emptyText}>No spending data this month.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Spending</Text>
        <Text style={styles.totalText}>{formatCurrencyFull(data.total)}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.chartContainer} accessibilityLabel={`Spending breakdown: ${formatCurrencyFull(data.total)} total`}>
          <PieChart
            data={chartData}
            donut
            innerRadius={40}
            radius={65}
            innerCircleColor={colors.card}
            centerLabelComponent={() => (
              <View style={styles.centerLabel}>
                <Text style={styles.centerLabelText}>{chartData.length}</Text>
                <Text style={styles.centerLabelSub}>categories</Text>
              </View>
            )}
          />
        </View>
        <View style={styles.legend}>
          {chartData.map((entry, i) => (
            <View
              key={entry.text}
              style={[styles.legendRow, i % 2 === 0 && styles.legendRowAlt]}
              accessibilityLabel={`${entry.text}: ${formatCurrencyFull(entry.value)}`}
            >
              <View style={styles.legendLeft}>
                <View style={[styles.legendDot, { backgroundColor: entry.color }]} />
                <Text style={styles.legendName} numberOfLines={1}>{entry.text}</Text>
              </View>
              <Text style={styles.legendAmount}>{formatCurrencyFull(entry.value)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  totalText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "700",
  },
  content: {
    alignItems: "center",
    gap: spacing.md,
  },
  chartContainer: {
    alignItems: "center",
  },
  centerLabel: {
    alignItems: "center",
  },
  centerLabelText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700",
  },
  centerLabelSub: {
    color: colors.muted,
    fontSize: 9,
  },
  legend: {
    width: "100%",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  legendRowAlt: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  legendLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  legendAmount: {
    color: colors.muted,
    fontSize: 13,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: spacing.xl,
    fontSize: 13,
  },
});
