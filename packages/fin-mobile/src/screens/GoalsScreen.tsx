import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { ImpactFeedbackStyle } from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type {
  Goal,
  CreateGoalRequest,
  UpdateGoalRequest,
} from "@derekentringer/shared/finance";
import {
  useGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  useReorderGoals,
} from "@/hooks/useGoals";
import { useGoalProgress } from "@/hooks/useDashboard";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalFormSheet } from "@/components/goals/GoalFormSheet";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import type { PlanningStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

type Nav = NativeStackNavigationProp<PlanningStackParamList, "GoalsList">;

export function GoalsScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [formGoal, setFormGoal] = useState<Goal | null>(null);
  const [showForm, setShowForm] = useState(false);

  const goalsQuery = useGoals();
  const progressQuery = useGoalProgress(60);
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const reorderGoals = useReorderGoals();

  const goals = useMemo(() => {
    if (!goalsQuery.data) return [];
    return [...goalsQuery.data.goals].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [goalsQuery.data]);

  const progressMap = useMemo(() => {
    if (!progressQuery.data) return new Map();
    const map = new Map<string, (typeof progressQuery.data.goals)[number]>();
    for (const gp of progressQuery.data.goals) {
      map.set(gp.goalId, gp);
    }
    return map;
  }, [progressQuery.data]);

  const monthlySurplus = progressQuery.data?.monthlySurplus ?? 0;
  const onTrackCount = useMemo(() => {
    if (!progressQuery.data) return { on: 0, total: 0 };
    const activeGoals = progressQuery.data.goals;
    const on = activeGoals.filter((g) => g.onTrack).length;
    return { on, total: activeGoals.length };
  }, [progressQuery.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync();
    await queryClient.invalidateQueries({ queryKey: ["goals"] });
    setRefreshing(false);
  }, [queryClient]);

  const handleCreate = useCallback(
    async (formData: CreateGoalRequest | UpdateGoalRequest) => {
      await createGoal.mutateAsync(formData as CreateGoalRequest);
      setShowForm(false);
    },
    [createGoal],
  );

  const handleUpdate = useCallback(
    async (formData: CreateGoalRequest | UpdateGoalRequest) => {
      if (!formGoal) return;
      await updateGoal.mutateAsync({
        id: formGoal.id,
        data: formData as UpdateGoalRequest,
      });
      setShowForm(false);
      setFormGoal(null);
    },
    [formGoal, updateGoal],
  );

  const handleDeleteConfirm = useCallback((goal: Goal) => {
    Alert.alert("Delete Goal", `Delete "${goal.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGoal.mutate({ id: goal.id });
        },
      },
    ]);
  }, [deleteGoal]);

  if (goalsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonChartCard height={200} />
      </View>
    );
  }

  if (goalsQuery.error) {
    return (
      <View style={styles.container}>
        <ErrorCard
          message="Failed to load goals"
          onRetry={() => goalsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* KPI Row */}
      {goals.length > 0 && (
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Monthly Surplus</Text>
            <Text
              style={[
                styles.kpiValue,
                { color: monthlySurplus >= 0 ? colors.success : colors.error },
              ]}
            >
              {formatCurrencyFull(monthlySurplus)}
            </Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Goals On Track</Text>
            <Text style={styles.kpiValue}>
              {onTrackCount.on}/{onTrackCount.total}
            </Text>
          </View>
        </View>
      )}

      <DraggableFlatList
        data={goals}
        keyExtractor={(item) => item.id}
        onDragBegin={() => {
          Haptics.impactAsync(ImpactFeedbackStyle.Medium);
        }}
        onDragEnd={({ data }) => {
          const order = data.map((g, i) => ({ id: g.id, sortOrder: i }));
          reorderGoals.mutate({ order });
        }}
        renderItem={({ item, drag, isActive }: RenderItemParams<Goal>) => (
          <GoalCard
            goal={item}
            progress={progressMap.get(item.id)}
            onPress={() =>
              navigation.navigate("GoalDetail", {
                goalId: item.id,
                goalName: item.name,
              })
            }
            onEdit={() => {
              setFormGoal(item);
              setShowForm(true);
            }}
            onDelete={() => handleDeleteConfirm(item)}
            drag={drag}
            isActive={isActive}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={
          goals.length === 0 ? styles.emptyContainer : undefined
        }
        ListEmptyComponent={
          <EmptyState
            message="No goals yet"
            actionLabel="Add Goal"
            onAction={() => {
              setFormGoal(null);
              setShowForm(true);
            }}
          />
        }
        containerStyle={styles.list}
      />

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setFormGoal(null);
          setShowForm(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add goal"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#ffffff" />
      </Pressable>

      {showForm && (
        <GoalFormSheet
          goal={formGoal}
          onClose={() => {
            setShowForm(false);
            setFormGoal(null);
          }}
          onSubmit={formGoal ? handleUpdate : handleCreate}
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
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  kpiItem: {
    flex: 1,
    alignItems: "center",
  },
  kpiDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  kpiValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
