import React, { useState, useMemo, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type {
  GoalType,
  CreateGoalRequest,
  UpdateGoalRequest,
} from "@derekentringer/shared/finance";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import { useGoal, useUpdateGoal, useDeleteGoal } from "@/hooks/useGoals";
import { useGoalProgress } from "@/hooks/useDashboard";
import { GoalProjectionChart } from "@/components/goals/GoalProjectionChart";
import { GoalFormSheet } from "@/components/goals/GoalFormSheet";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import type { PlanningStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

type RouteParams = RouteProp<PlanningStackParamList, "GoalDetail">;
type Nav = NativeStackNavigationProp<PlanningStackParamList, "GoalDetail">;

const GOAL_TYPE_COLORS: Record<GoalType, string> = {
  savings: "#22c55e",
  debt_payoff: "#ef4444",
  net_worth: "#2563eb",
  custom: "#f59e0b",
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function GoalDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { goalId, goalName } = route.params;

  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const goalQuery = useGoal(goalId);
  const progressQuery = useGoalProgress(60);
  const updateGoal = useUpdateGoal();
  const deleteGoalMutation = useDeleteGoal();

  const goal = goalQuery.data?.goal;

  const progress = useMemo(() => {
    if (!progressQuery.data) return undefined;
    return progressQuery.data.goals.find((g) => g.goalId === goalId);
  }, [progressQuery.data, goalId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["goals", goalId] }),
      queryClient.invalidateQueries({ queryKey: ["goals"] }),
    ]);
    setRefreshing(false);
  }, [queryClient, goalId]);

  const handleUpdate = useCallback(
    async (formData: CreateGoalRequest | UpdateGoalRequest) => {
      await updateGoal.mutateAsync({
        id: goalId,
        data: formData as UpdateGoalRequest,
      });
      setShowForm(false);
    },
    [goalId, updateGoal],
  );

  const handleDelete = useCallback(() => {
    Alert.alert("Delete Goal", `Delete "${goalName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGoalMutation.mutate(
            { id: goalId },
            {
              onSuccess: () => {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                navigation.goBack();
              },
            },
          );
        },
      },
    ]);
  }, [goalId, goalName, deleteGoalMutation, navigation]);

  // Header right buttons
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowForm(true)}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Edit goal"
          >
            <MaterialCommunityIcons
              name="pencil"
              size={20}
              color={colors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Delete goal"
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color={colors.destructive}
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, handleDelete]);

  if (goalQuery.isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonChartCard height={200} />
      </View>
    );
  }

  if (goalQuery.error || !goal) {
    return (
      <View style={styles.container}>
        <ErrorCard
          message="Failed to load goal"
          onRetry={() => goalQuery.refetch()}
        />
      </View>
    );
  }

  const typeColor = GOAL_TYPE_COLORS[goal.type];
  const percent = progress?.percentComplete ?? 0;
  const currentAmount = progress?.currentAmount ?? goal.currentAmount ?? 0;

  function getStatusInfo() {
    if (goal!.isCompleted) {
      return { label: "Complete", color: "#2563eb" };
    }
    if (progress?.onTrack) {
      return { label: "On Track", color: "#22c55e" };
    }
    return { label: "Off Track", color: "#ef4444" };
  }

  const status = getStatusInfo();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Status badge row */}
        <Card style={styles.heroCard}>
          <View style={styles.badgeRow}>
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
          </View>
        </Card>

        {/* Projection Chart */}
        {progress?.projection && progress.projection.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Projection</Text>
            <GoalProjectionChart
              projection={progress.projection}
              goalType={goal.type}
              targetAmount={goal.targetAmount}
              mini={false}
            />
          </Card>
        )}

        {/* Stats Grid */}
        <Card>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Current Amount</Text>
                <Text style={styles.statValue}>
                  {formatCurrencyFull(currentAmount)}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Target Amount</Text>
                <Text style={styles.statValue}>
                  {formatCurrencyFull(goal.targetAmount)}
                </Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Monthly Contribution</Text>
                <Text style={styles.statValue}>
                  {formatCurrencyFull(
                    progress?.monthlyContribution ??
                      goal.monthlyContribution ??
                      0,
                  )}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Priority</Text>
                <Text style={styles.statValue}>{goal.priority}</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Start Date</Text>
                <Text style={styles.statValue}>
                  {goal.startDate ? formatDate(goal.startDate) : "--"}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Target Date</Text>
                <Text style={styles.statValue}>
                  {goal.targetDate ? formatDate(goal.targetDate) : "--"}
                </Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Projected Completion</Text>
                <Text style={styles.statValue}>
                  {progress?.projectedCompletionDate
                    ? formatDate(progress.projectedCompletionDate)
                    : "--"}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Progress</Text>
                <Text style={styles.statValue}>
                  {Math.round(percent)}%
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Notes */}
        {goal.notes && (
          <Card>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{goal.notes}</Text>
          </Card>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {showForm && (
        <GoalFormSheet
          goal={goal}
          onClose={() => setShowForm(false)}
          onSubmit={handleUpdate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
  },
  heroCard: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  statsGrid: {
    gap: spacing.xs,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  statValue: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  notesText: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 20,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
