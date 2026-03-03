import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type {
  Budget,
  CategoryBudgetSummary,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "@derekentringer/shared/finance";
import {
  useBudgets,
  useBudgetSummary,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from "@/hooks/useBudgets";
import { MonthSelector } from "@/components/budgets/MonthSelector";
import { BudgetCategoryRow } from "@/components/budgets/BudgetCategoryRow";
import { BudgetFormSheet } from "@/components/budgets/BudgetFormSheet";
import { PinGateModal } from "@/components/common/PinGateModal";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetsScreen() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(getCurrentMonth);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formBudget, setFormBudget] = useState<Budget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const summaryQuery = useBudgetSummary(month);
  const budgetsQuery = useBudgets();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();

  const categories = useMemo(
    () => summaryQuery.data?.categories ?? [],
    [summaryQuery.data],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const findBudgetForCategory = useCallback(
    (categoryName: string): Budget | undefined => {
      return budgetsQuery.data?.budgets.find(
        (b) => b.category === categoryName,
      );
    },
    [budgetsQuery.data],
  );

  const handleCreate = useCallback(
    async (formData: CreateBudgetRequest | UpdateBudgetRequest) => {
      await createBudget.mutateAsync(formData as CreateBudgetRequest);
      setShowForm(false);
    },
    [createBudget],
  );

  const handleUpdate = useCallback(
    async (formData: CreateBudgetRequest | UpdateBudgetRequest) => {
      if (!formBudget) return;
      await updateBudget.mutateAsync({
        id: formBudget.id,
        data: formData as UpdateBudgetRequest,
      });
      setShowForm(false);
      setFormBudget(null);
    },
    [formBudget, updateBudget],
  );

  const handleEdit = useCallback(
    (cat: CategoryBudgetSummary) => {
      const budget = findBudgetForCategory(cat.category);
      if (budget) {
        setFormBudget(budget);
        setShowForm(true);
      }
    },
    [findBudgetForCategory],
  );

  const handleDeleteConfirm = useCallback(
    (cat: CategoryBudgetSummary) => {
      const budget = findBudgetForCategory(cat.category);
      if (!budget) return;
      Alert.alert(
        "Delete Budget",
        `Delete budget for "${cat.category}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setDeletingId(budget.id);
              setShowPin(true);
            },
          },
        ],
      );
    },
    [findBudgetForCategory],
  );

  const handlePinVerified = useCallback(
    (pinToken: string) => {
      setShowPin(false);
      if (deletingId) {
        deleteBudget.mutate({ id: deletingId, pinToken });
        setDeletingId(null);
      }
    },
    [deletingId, deleteBudget],
  );

  return (
    <View style={styles.container}>
      <MonthSelector month={month} onMonthChange={setMonth} />

      {summaryQuery.isLoading ? (
        <SkeletonChartCard height={200} />
      ) : summaryQuery.error ? (
        <ErrorCard
          message="Failed to load budgets"
          onRetry={() => summaryQuery.refetch()}
        />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.category}
          renderItem={({ item }) => (
            <BudgetCategoryRow
              summary={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDeleteConfirm(item)}
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
            categories.length === 0 ? styles.emptyContainer : undefined
          }
          ListEmptyComponent={
            <EmptyState
              message="No budgets set. Create your first budget to track spending."
              actionLabel="Add Budget"
              onAction={() => {
                setFormBudget(null);
                setShowForm(true);
              }}
            />
          }
          ListFooterComponent={
            summaryQuery.data && categories.length > 0 ? (
              <View style={styles.totalsRow}>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Budgeted</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrencyFull(summaryQuery.data.totalBudgeted)}
                  </Text>
                </View>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Actual</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrencyFull(summaryQuery.data.totalActual)}
                  </Text>
                </View>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Remaining</Text>
                  <Text
                    style={[
                      styles.totalValue,
                      summaryQuery.data.totalRemaining < 0 && styles.overBudget,
                    ]}
                  >
                    {formatCurrencyFull(summaryQuery.data.totalRemaining)}
                  </Text>
                </View>
              </View>
            ) : null
          }
          style={styles.list}
        />
      )}

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setFormBudget(null);
          setShowForm(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add budget"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#ffffff" />
      </Pressable>

      {showForm && (
        <BudgetFormSheet
          budget={formBudget}
          onClose={() => {
            setShowForm(false);
            setFormBudget(null);
          }}
          onSubmit={formBudget ? handleUpdate : handleCreate}
        />
      )}

      <PinGateModal
        visible={showPin}
        onClose={() => {
          setShowPin(false);
          setDeletingId(null);
        }}
        onVerified={handlePinVerified}
        title="Delete Budget"
        description="Enter PIN to confirm deletion"
      />
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
  },
  emptyContainer: {
    flex: 1,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalItem: {
    alignItems: "center",
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  totalValue: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  overBudget: {
    color: colors.error,
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
