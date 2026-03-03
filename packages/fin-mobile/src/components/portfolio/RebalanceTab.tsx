import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import { useRebalanceSuggestions } from "@/hooks/usePortfolio";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface RebalanceTabProps {
  accountId?: string;
}

export function RebalanceTab({ accountId }: RebalanceTabProps) {
  const { data, isLoading, error, refetch } =
    useRebalanceSuggestions(accountId);

  if (isLoading && !data) return <SkeletonChartCard height={200} />;
  if (error && !data) {
    return (
      <ErrorCard
        message="Failed to load rebalance suggestions"
        onRetry={() => refetch()}
      />
    );
  }
  if (!data || data.suggestions.length === 0) {
    return (
      <EmptyState message="Set target allocations in the Allocation tab to see rebalance suggestions." />
    );
  }

  const totalMarketValue = data.suggestions.reduce(
    (sum, s) => sum + Math.abs(s.amount),
    0,
  );

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Market Value</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>
            {formatCurrencyFull(totalMarketValue)}
          </Text>
        </View>
      </Card>

      <Card>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.assetCol]}>Asset Class</Text>
          <Text style={[styles.headerCell, styles.pctCol]}>Current</Text>
          <Text style={[styles.headerCell, styles.pctCol]}>Target</Text>
          <Text style={[styles.headerCell, styles.pctCol]}>Drift</Text>
          <Text style={[styles.headerCell, styles.actionCol]}>Action</Text>
        </View>

        {data.suggestions.map((suggestion) => {
          const actionColor =
            suggestion.action === "buy"
              ? colors.success
              : suggestion.action === "sell"
                ? colors.error
                : colors.muted;
          const actionLabel =
            suggestion.action === "buy"
              ? "Buy"
              : suggestion.action === "sell"
                ? "Sell"
                : "Hold";

          return (
            <View key={suggestion.assetClass} style={styles.row}>
              <Text style={[styles.cell, styles.assetCol]} numberOfLines={1}>
                {ASSET_CLASS_LABELS[suggestion.assetClass]}
              </Text>
              <Text style={[styles.cell, styles.pctCol]}>
                {suggestion.currentPct.toFixed(1)}%
              </Text>
              <Text style={[styles.cell, styles.pctCol]}>
                {suggestion.targetPct.toFixed(1)}%
              </Text>
              <Text style={[styles.cell, styles.pctCol]}>
                {suggestion.drift.toFixed(1)}%
              </Text>
              <View style={styles.actionCol}>
                <View
                  style={[
                    styles.actionBadge,
                    { backgroundColor: actionColor + "20" },
                  ]}
                >
                  <Text style={[styles.actionText, { color: actionColor }]}>
                    {actionLabel}
                  </Text>
                </View>
                <Text style={styles.amountText}>
                  {formatCurrencyFull(Math.abs(suggestion.amount))}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  headerCell: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cell: {
    color: colors.foreground,
    fontSize: 12,
  },
  assetCol: {
    flex: 1.5,
  },
  pctCol: {
    flex: 1,
    textAlign: "center",
  },
  actionCol: {
    flex: 1.5,
    alignItems: "flex-end",
  },
  actionBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 1,
  },
  actionText: {
    fontSize: 10,
    fontWeight: "600",
  },
  amountText: {
    color: colors.muted,
    fontSize: 10,
  },
});
