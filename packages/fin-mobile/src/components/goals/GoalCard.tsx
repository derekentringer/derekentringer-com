import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Goal, GoalProgress, GoalType } from "@derekentringer/shared/finance";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

const GOAL_TYPE_COLORS: Record<GoalType, string> = {
  savings: "#22c55e",
  debt_payoff: "#ef4444",
  net_worth: "#2563eb",
  custom: "#f59e0b",
};

interface GoalCardProps {
  goal: Goal;
  progress?: GoalProgress;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  drag: () => void;
  isActive: boolean;
}

function getStatusInfo(goal: Goal, progress?: GoalProgress) {
  if (goal.isCompleted) {
    return { label: "Complete", color: "#2563eb" };
  }
  if (progress?.onTrack) {
    return { label: "On Track", color: "#22c55e" };
  }
  return { label: "Off Track", color: "#ef4444" };
}

export function GoalCard({
  goal,
  progress,
  onPress,
  onEdit,
  onDelete,
  drag,
  isActive,
}: GoalCardProps) {
  const typeColor = GOAL_TYPE_COLORS[goal.type];
  const status = getStatusInfo(goal, progress);
  const percent = progress?.percentComplete ?? 0;
  const current = progress?.currentAmount ?? goal.currentAmount ?? 0;
  const projectedDate = progress?.projectedCompletionDate;

  return (
    <SwipeableRow onEdit={onEdit} onDelete={onDelete}>
      <Pressable
        style={[
          styles.row,
          !goal.isActive && styles.rowInactive,
          isActive && styles.rowDragging,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${goal.name}, ${formatCurrencyFull(current)} of ${formatCurrencyFull(goal.targetAmount)}`}
      >
        <Pressable
          onLongPress={drag}
          delayLongPress={150}
          accessibilityRole="button"
          accessibilityLabel="Drag to reorder"
          style={styles.dragHandle}
        >
          <MaterialCommunityIcons
            name="drag-horizontal"
            size={20}
            color={colors.muted}
          />
        </Pressable>

        <View style={styles.content}>
          {/* Row 1: name + badges + percentage */}
          <View style={styles.topRow}>
            <Text
              style={[styles.goalName, !goal.isActive && styles.textInactive]}
              numberOfLines={1}
            >
              {goal.name}
            </Text>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: typeColor + "26" },
              ]}
            >
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                {GOAL_TYPE_LABELS[goal.type]}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: status.color + "26" },
              ]}
            >
              <Text style={[styles.statusBadgeText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
            <Text style={styles.percentText}>
              {Math.round(percent)}%
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, percent)}%`,
                  backgroundColor: typeColor,
                },
              ]}
            />
          </View>

          {/* Row 2: current amount + projected completion */}
          <View style={styles.bottomRow}>
            <Text style={styles.amountText}>
              {formatCurrencyFull(current)} / {formatCurrencyFull(goal.targetAmount)}
            </Text>
            {projectedDate && (
              <Text style={styles.projectedText}>
                Est.{" "}
                {new Date(projectedDate + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowInactive: {
    opacity: 0.5,
  },
  textInactive: {
    color: colors.muted,
  },
  rowDragging: {
    transform: [{ scale: 1.03 }],
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.xs,
  },
  dragHandle: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    marginLeft: -4,
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  goalName: {
    color: colors.foreground,
    fontSize: 14,
    flex: 1,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  percentText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginBottom: spacing.xs,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountText: {
    color: colors.foreground,
    fontSize: 12,
  },
  projectedText: {
    color: colors.muted,
    fontSize: 11,
  },
});
