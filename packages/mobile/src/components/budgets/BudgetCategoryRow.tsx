import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { CategoryBudgetSummary } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface BudgetCategoryRowProps {
  summary: CategoryBudgetSummary;
  onEdit: () => void;
  onDelete: () => void;
}

export function BudgetCategoryRow({
  summary,
  onEdit,
  onDelete,
}: BudgetCategoryRowProps) {
  const percentage = summary.budgeted > 0
    ? Math.min(100, (summary.actual / summary.budgeted) * 100)
    : 0;
  const isOver = summary.actual > summary.budgeted;
  const barColor = isOver ? colors.error : colors.success;

  return (
    <SwipeableRow onEdit={onEdit} onDelete={onDelete}>
      <View style={styles.row}>
        <View style={styles.topRow}>
          <Text style={styles.categoryName} numberOfLines={1}>
            {summary.category}
          </Text>
          <Text style={[styles.remaining, isOver && styles.remainingOver]}>
            {isOver ? "-" : ""}
            {formatCurrencyFull(Math.abs(summary.remaining))}
            {isOver ? " over" : " left"}
          </Text>
        </View>
        <View style={styles.barContainer}>
          <View
            style={[
              styles.barFill,
              { width: `${percentage}%`, backgroundColor: barColor },
            ]}
          />
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.amounts}>
            {formatCurrencyFull(summary.actual)} / {formatCurrencyFull(summary.budgeted)}
          </Text>
          <Text style={styles.percentage}>{Math.round(percentage)}%</Text>
        </View>
      </View>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  categoryName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  remaining: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "500",
  },
  remainingOver: {
    color: colors.error,
  },
  barContainer: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amounts: {
    color: colors.muted,
    fontSize: 11,
  },
  percentage: {
    color: colors.muted,
    fontSize: 11,
  },
});
