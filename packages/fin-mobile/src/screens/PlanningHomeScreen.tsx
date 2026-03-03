import React, { useState, useMemo, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useBills, useUpcomingBills } from "@/hooks/useBills";
import { useBudgetSummary } from "@/hooks/useBudgets";
import { useGoalProgress } from "@/hooks/useDashboard";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import type { PlanningStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

type Nav = NativeStackNavigationProp<PlanningStackParamList, "PlanningHome">;

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PlanningHomeScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = useMemo(getCurrentMonth, []);
  const billsQuery = useUpcomingBills(60);
  const allBillsQuery = useBills();
  const budgetQuery = useBudgetSummary(currentMonth);
  const goalProgressQuery = useGoalProgress(60);

  // Filter upcoming bills for current month only
  const upcomingBills = useMemo(() => {
    if (!billsQuery.data) return [];
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return billsQuery.data.bills
      .filter((b) => {
        if (b.isPaid) return false;
        const due = new Date(b.dueDate + "T00:00:00");
        return due <= endOfMonth;
      })
      .sort(
        (a, b) =>
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );
  }, [billsQuery.data]);

  const monthlyBillTotal = useMemo(() => {
    if (!allBillsQuery.data) return 0;
    return allBillsQuery.data.bills
      .filter((b) => b.isActive)
      .reduce((sum, b) => {
        switch (b.frequency) {
          case "weekly":
            return sum + b.amount * 4.33;
          case "biweekly":
            return sum + b.amount * 2.17;
          case "monthly":
            return sum + b.amount;
          case "quarterly":
            return sum + b.amount / 3;
          case "yearly":
            return sum + b.amount / 12;
          default:
            return sum + b.amount;
        }
      }, 0);
  }, [allBillsQuery.data]);

  const remainingBillTotal = useMemo(() => {
    return upcomingBills.reduce((sum, b) => sum + b.amount, 0);
  }, [upcomingBills]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bills"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["goals"] }),
      queryClient.invalidateQueries({ queryKey: ["projections"] }),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <ScrollView
      style={styles.container}
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
      {/* Bills Section */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderTitle}>Bills</Text>
          <Pressable
            onPress={() => navigation.navigate("BillsList")}
            style={styles.cardHeaderAction}
            accessibilityRole="button"
          >
            <Text style={styles.cardHeaderActionText}>See All</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </View>
        {billsQuery.isLoading ? (
          <SkeletonChartCard height={80} />
        ) : billsQuery.error ? (
          <ErrorCard
            message="Failed to load bills"
            onRetry={() => billsQuery.refetch()}
          />
        ) : upcomingBills.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming bills this month.</Text>
        ) : (
          <>
            {upcomingBills.slice(0, 5).map((bill, i) => (
              <Pressable
                key={`${bill.billId}-${bill.dueDate}-${i}`}
                style={[styles.billRow, i % 2 === 0 && styles.billRowAlt]}
                onPress={() =>
                  navigation.navigate("BillDetail", {
                    billId: bill.billId,
                    billName: bill.billName,
                  })
                }
                accessibilityRole="button"
              >
                <View style={styles.billNameContainer}>
                  <Text style={styles.billName} numberOfLines={1}>
                    {bill.billName}
                  </Text>
                  {bill.isOverdue && (
                    <View style={styles.overdueBadge}>
                      <Text style={styles.overdueBadgeText}>Overdue</Text>
                    </View>
                  )}
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billDate}>
                    {formatDate(bill.dueDate)}
                  </Text>
                  <Text style={styles.billAmount}>
                    {formatCurrencyFull(bill.amount)}
                  </Text>
                </View>
              </Pressable>
            ))}
            {upcomingBills.length > 5 && (
              <Text style={styles.moreText}>
                +{upcomingBills.length - 5} more
              </Text>
            )}
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>Monthly Total</Text>
                <Text style={styles.totalAmount}>
                  {formatCurrencyFull(monthlyBillTotal)}
                </Text>
              </View>
              <View>
                <Text style={styles.totalLabel}>Remaining</Text>
                <Text style={styles.totalAmount}>
                  {formatCurrencyFull(remainingBillTotal)}
                </Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {/* Budgets Section */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderTitle}>Budgets</Text>
          <Pressable
            onPress={() => navigation.navigate("BudgetsList")}
            style={styles.cardHeaderAction}
            accessibilityRole="button"
          >
            <Text style={styles.cardHeaderActionText}>See All</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </View>
        {budgetQuery.isLoading ? (
          <SkeletonChartCard height={80} />
        ) : budgetQuery.error ? (
          <ErrorCard
            message="Failed to load budgets"
            onRetry={() => budgetQuery.refetch()}
          />
        ) : !budgetQuery.data || budgetQuery.data.categories.length === 0 ? (
          <Text style={styles.emptyText}>
            No budgets set for this month.
          </Text>
        ) : (
          <>
            <View style={styles.budgetSummaryRow}>
              <View>
                <Text style={styles.budgetSummaryLabel}>Budgeted</Text>
                <Text style={styles.budgetSummaryValue}>
                  {formatCurrencyFull(budgetQuery.data.totalBudgeted)}
                </Text>
              </View>
              <View>
                <Text style={styles.budgetSummaryLabel}>Actual</Text>
                <Text style={styles.budgetSummaryValue}>
                  {formatCurrencyFull(budgetQuery.data.totalActual)}
                </Text>
              </View>
              <View>
                <Text style={styles.budgetSummaryLabel}>Remaining</Text>
                <Text
                  style={[
                    styles.budgetSummaryValue,
                    budgetQuery.data.totalRemaining < 0 &&
                      styles.budgetOverValue,
                  ]}
                >
                  {formatCurrencyFull(budgetQuery.data.totalRemaining)}
                </Text>
              </View>
            </View>
            {budgetQuery.data.categories.slice(0, 5).map((cat) => {
              const pct =
                cat.budgeted > 0
                  ? Math.min(100, (cat.actual / cat.budgeted) * 100)
                  : 0;
              const isOver = cat.actual > cat.budgeted;
              return (
                <View key={cat.category} style={styles.miniRow}>
                  <Text style={styles.miniCategory} numberOfLines={1}>
                    {cat.category}
                  </Text>
                  <View style={styles.miniBarContainer}>
                    <View
                      style={[
                        styles.miniBarFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: isOver
                            ? colors.error
                            : colors.success,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.miniAmount,
                      isOver && styles.budgetOverValue,
                    ]}
                  >
                    {formatCurrencyFull(cat.actual)} /{" "}
                    {formatCurrencyFull(cat.budgeted)}
                  </Text>
                </View>
              );
            })}
            {budgetQuery.data.categories.length > 5 && (
              <Text style={styles.moreText}>
                +{budgetQuery.data.categories.length - 5} more
              </Text>
            )}
          </>
        )}
      </Card>

      {/* Goals Section */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderTitle}>Goals</Text>
          <Pressable
            onPress={() => navigation.navigate("GoalsList")}
            style={styles.cardHeaderAction}
            accessibilityRole="button"
          >
            <Text style={styles.cardHeaderActionText}>See All</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </View>
        {goalProgressQuery.isLoading ? (
          <SkeletonChartCard height={80} />
        ) : goalProgressQuery.error ? (
          <ErrorCard
            message="Failed to load goals"
            onRetry={() => goalProgressQuery.refetch()}
          />
        ) : !goalProgressQuery.data || goalProgressQuery.data.goals.length === 0 ? (
          <Text style={styles.emptyText}>No goals set yet.</Text>
        ) : (
          <>
            <View style={styles.budgetSummaryRow}>
              <View>
                <Text style={styles.budgetSummaryLabel}>Monthly Surplus</Text>
                <Text style={[styles.budgetSummaryValue, goalProgressQuery.data.monthlySurplus < 0 && styles.budgetOverValue]}>
                  {formatCurrencyFull(goalProgressQuery.data.monthlySurplus)}
                </Text>
              </View>
              <View>
                <Text style={styles.budgetSummaryLabel}>On Track</Text>
                <Text style={styles.budgetSummaryValue}>
                  {goalProgressQuery.data.goals.filter(g => g.onTrack).length}/{goalProgressQuery.data.goals.length}
                </Text>
              </View>
            </View>
            {goalProgressQuery.data.goals.slice(0, 3).map((goal) => {
              const pct = Math.min(100, goal.percentComplete);
              return (
                <View key={goal.goalId} style={styles.miniRow}>
                  <Text style={styles.miniCategory} numberOfLines={1}>
                    {goal.goalName}
                  </Text>
                  <View style={styles.miniBarContainer}>
                    <View
                      style={[
                        styles.miniBarFill,
                        { width: `${pct}%`, backgroundColor: goal.onTrack ? colors.success : colors.error },
                      ]}
                    />
                  </View>
                  <Text style={styles.miniAmount}>
                    {Math.round(pct)}%
                  </Text>
                </View>
              );
            })}
            {goalProgressQuery.data.goals.length > 3 && (
              <Text style={styles.moreText}>
                +{goalProgressQuery.data.goals.length - 3} more
              </Text>
            )}
          </>
        )}
      </Card>

      {/* Projections Section */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderTitle}>Projections</Text>
          <Pressable
            onPress={() => navigation.navigate("Projections")}
            style={styles.cardHeaderAction}
            accessibilityRole="button"
          >
            <Text style={styles.cardHeaderActionText}>Explore</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable
          style={styles.projectionRow}
          onPress={() => navigation.navigate("Projections")}
          accessibilityRole="button"
        >
          <Text style={styles.projectionRowText}>Net Income Forecast</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
        <Pressable
          style={styles.projectionRow}
          onPress={() => navigation.navigate("Projections")}
          accessibilityRole="button"
        >
          <Text style={styles.projectionRowText}>Savings Growth</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
        <Pressable
          style={[styles.projectionRow, styles.projectionRowLast]}
          onPress={() => navigation.navigate("Projections")}
          accessibilityRole="button"
        >
          <Text style={styles.projectionRowText}>Debt Payoff Plan</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
      </Card>

      {/* Decision Tools Section */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderTitle}>Decision Tools</Text>
          <Pressable
            onPress={() => navigation.navigate("DecisionTools")}
            style={styles.cardHeaderAction}
            accessibilityRole="button"
          >
            <Text style={styles.cardHeaderActionText}>Explore</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable
          style={styles.projectionRow}
          onPress={() => navigation.navigate("DecisionTools")}
          accessibilityRole="button"
        >
          <Text style={styles.projectionRowText}>HYS vs. Debt Payoff</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
        <Pressable
          style={[styles.projectionRow, styles.projectionRowLast]}
          onPress={() => navigation.navigate("DecisionTools")}
          accessibilityRole="button"
        >
          <Text style={styles.projectionRowText}>401(k) Optimizer</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHeaderTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
  cardHeaderAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cardHeaderActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "500",
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: spacing.lg,
    fontSize: 13,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  billRowAlt: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  billNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  billName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  overdueBadge: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  overdueBadgeText: {
    color: colors.error,
    fontSize: 9,
    fontWeight: "600",
  },
  billRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  billDate: {
    color: colors.muted,
    fontSize: 11,
  },
  billAmount: {
    color: colors.foreground,
    fontSize: 13,
  },
  moreText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  totalAmount: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
  },
  budgetSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  budgetSummaryLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  budgetSummaryValue: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  budgetOverValue: {
    color: colors.error,
  },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  miniCategory: {
    color: colors.foreground,
    fontSize: 12,
    width: 80,
  },
  miniBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  miniBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  miniAmount: {
    color: colors.muted,
    fontSize: 10,
    width: 100,
    textAlign: "right",
  },
  projectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  projectionRowLast: {
    borderBottomWidth: 0,
  },
  projectionRowText: {
    color: colors.foreground,
    fontSize: 14,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
