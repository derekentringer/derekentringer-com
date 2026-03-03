import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "@/components/common/Card";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { useGoalProgress } from "@/hooks/useDashboard";
import { formatCurrency } from "@/lib/chartTheme";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import { colors, spacing, borderRadius } from "@/theme";

const TYPE_COLORS: Record<string, string> = {
  savings: "#22c55e",
  debt_payoff: "#ef4444",
  net_worth: "#2563eb",
  custom: "#f59e0b",
};

const MAX_GOALS_SHOWN = 5;

export function GoalsSummaryCard() {
  const { data, isLoading, error, refetch } = useGoalProgress(60);

  if (isLoading) return <SkeletonCard lines={3} />;

  if (error) return <ErrorCard message="Failed to load goals" onRetry={() => refetch()} />;

  if (!data || data.goals.length === 0) return null;

  const goals = data.goals.slice(0, MAX_GOALS_SHOWN);
  const hasMore = data.goals.length > MAX_GOALS_SHOWN;

  return (
    <Card>
      <Text style={styles.header}>Goals</Text>
      <View style={styles.list}>
        {goals.map((goal) => {
          const typeColor = TYPE_COLORS[goal.goalType] ?? "#94a3b8";
          const percent = Math.min(goal.percentComplete, 100);

          return (
            <View key={goal.goalId} style={styles.goalItem} accessibilityLabel={`${goal.goalName}: ${percent.toFixed(0)}% complete, ${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}`}>
              <View style={styles.goalTopRow}>
                <View style={styles.goalNameRow}>
                  <Text style={styles.goalName} numberOfLines={1}>{goal.goalName}</Text>
                  <View style={[styles.typeBadge, { borderColor: typeColor }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                      {GOAL_TYPE_LABELS[goal.goalType] ?? goal.goalType}
                    </Text>
                  </View>
                </View>
                <Text style={styles.percentText}>{percent.toFixed(0)}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${percent}%`, backgroundColor: typeColor },
                  ]}
                />
              </View>
              <View style={styles.goalBottomRow}>
                <Text style={styles.goalDetail}>{formatCurrency(goal.currentAmount)}</Text>
                <Text style={styles.goalDetail}>
                  {goal.projectedCompletionDate
                    ? `Est. ${goal.projectedCompletionDate}`
                    : "No date"}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      {hasMore && (
        <Text style={styles.moreText}>
          +{data.goals.length - MAX_GOALS_SHOWN} more goals
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  goalItem: {
    gap: 4,
  },
  goalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  goalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  goalName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  typeBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  percentText: {
    color: colors.muted,
    fontSize: 11,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  goalBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalDetail: {
    color: colors.muted,
    fontSize: 10,
  },
  moreText: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
