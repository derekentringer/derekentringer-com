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
import {
  BILL_FREQUENCY_LABELS,
  type UpdateBillRequest,
  type CreateBillRequest,
} from "@derekentringer/shared/finance";
import { useBill, useUpcomingBills, useDeleteBill } from "@/hooks/useBills";
import { BillFormSheet } from "@/components/bills/BillFormSheet";
import { PinGateModal } from "@/components/common/PinGateModal";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import type { PlanningStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";
import { useUpdateBill } from "@/hooks/useBills";

type RouteParams = RouteProp<PlanningStackParamList, "BillDetail">;
type Nav = NativeStackNavigationProp<PlanningStackParamList, "BillDetail">;

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function computeNextDates(
  frequency: string,
  dueDay: number,
  dueMonth?: number,
  dueWeekday?: number,
): Date[] {
  const dates: Date[] = [];
  const now = new Date();

  if (frequency === "monthly") {
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const day = Math.min(
        dueDay,
        new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      );
      const date = new Date(d.getFullYear(), d.getMonth(), day);
      if (date >= now || dates.length < 3) dates.push(date);
      if (dates.length >= 3) break;
    }
  } else if (frequency === "quarterly") {
    for (let i = 0; i < 12 && dates.length < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (d.getMonth() % 3 === 0) {
        const day = Math.min(
          dueDay,
          new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
        );
        dates.push(new Date(d.getFullYear(), d.getMonth(), day));
      }
    }
  } else if (frequency === "yearly" && dueMonth) {
    const month = dueMonth - 1;
    for (let y = now.getFullYear(); dates.length < 3; y++) {
      const day = Math.min(
        dueDay,
        new Date(y, month + 1, 0).getDate(),
      );
      const date = new Date(y, month, day);
      if (date >= now || dates.length === 0) dates.push(date);
    }
  } else if (
    (frequency === "weekly" || frequency === "biweekly") &&
    dueWeekday !== undefined
  ) {
    const cursor = new Date(now);
    const diff = (dueWeekday - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);
    const inc = frequency === "biweekly" ? 14 : 7;
    for (let i = 0; i < 3; i++) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + inc);
    }
  }

  return dates.slice(0, 3);
}

export function BillDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { billId, billName } = route.params;

  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const billQuery = useBill(billId);
  const upcomingQuery = useUpcomingBills(60);
  const updateBill = useUpdateBill();
  const deleteBillMutation = useDeleteBill();

  const bill = billQuery.data?.bill;

  const nextDates = useMemo(() => {
    if (!bill) return [];
    return computeNextDates(
      bill.frequency,
      bill.dueDay,
      bill.dueMonth ?? undefined,
      bill.dueWeekday ?? undefined,
    );
  }, [bill]);

  const paidInstances = useMemo(() => {
    if (!upcomingQuery.data) return [];
    return upcomingQuery.data.bills
      .filter((b) => b.billId === billId && b.isPaid)
      .sort(
        (a, b) =>
          new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
      );
  }, [upcomingQuery.data, billId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bills", billId] }),
      queryClient.invalidateQueries({ queryKey: ["bills"] }),
    ]);
    setRefreshing(false);
  }, [queryClient, billId]);

  const handleUpdate = useCallback(
    async (formData: CreateBillRequest | UpdateBillRequest) => {
      await updateBill.mutateAsync({
        id: billId,
        data: formData as UpdateBillRequest,
      });
      setShowForm(false);
    },
    [billId, updateBill],
  );

  const handleDelete = useCallback(() => {
    Alert.alert("Delete Bill", `Delete "${billName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => setShowPin(true),
      },
    ]);
  }, [billName]);

  const handlePinVerified = useCallback(
    (pinToken: string) => {
      setShowPin(false);
      deleteBillMutation.mutate(
        { id: billId, pinToken },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.goBack();
          },
        },
      );
    },
    [billId, deleteBillMutation, navigation],
  );

  // Header right buttons
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowForm(true)}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Edit bill"
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
            accessibilityLabel="Delete bill"
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

  if (billQuery.isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonChartCard height={200} />
      </View>
    );
  }

  if (billQuery.error || !bill) {
    return (
      <View style={styles.container}>
        <ErrorCard
          message="Failed to load bill"
          onRetry={() => billQuery.refetch()}
        />
      </View>
    );
  }

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
        {/* Hero */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroAmount}>
            {formatCurrencyFull(bill.amount)}
          </Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.frequencyBadge}>
              <Text style={styles.frequencyBadgeText}>
                {BILL_FREQUENCY_LABELS[bill.frequency]}
              </Text>
            </View>
            {!bill.isActive && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveBadgeText}>Inactive</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Info Rows */}
        <Card>
          {bill.category && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Category</Text>
              <Text style={styles.infoValue}>{bill.category}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Due Day</Text>
            <Text style={styles.infoValue}>{bill.dueDay}</Text>
          </View>
          {bill.notes && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Notes</Text>
              <Text style={styles.infoValue}>{bill.notes}</Text>
            </View>
          )}
        </Card>

        {/* Next 3 Dates */}
        {nextDates.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Next Due Dates</Text>
            {nextDates.map((d, i) => (
              <Text key={i} style={styles.nextDateText}>
                {d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            ))}
          </Card>
        )}

        {/* Recent Payments */}
        {paidInstances.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
            {paidInstances.map((p, i) => (
              <View
                key={`${p.billId}-${p.dueDate}-${i}`}
                style={styles.paymentRow}
              >
                <MaterialCommunityIcons
                  name="check-circle"
                  size={16}
                  color={colors.success}
                />
                <Text style={styles.paymentDate}>
                  {formatDate(p.dueDate)}
                </Text>
                <Text style={styles.paymentAmount}>
                  {formatCurrencyFull(p.amount)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {showForm && (
        <BillFormSheet
          bill={bill}
          onClose={() => setShowForm(false)}
          onSubmit={handleUpdate}
        />
      )}

      <PinGateModal
        visible={showPin}
        onClose={() => setShowPin(false)}
        onVerified={handlePinVerified}
        title="Delete Bill"
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
  heroAmount: {
    color: colors.foreground,
    fontSize: 32,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  heroBadgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  frequencyBadge: {
    backgroundColor: "rgba(37,99,235,0.15)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  frequencyBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  inactiveBadge: {
    backgroundColor: "rgba(153,153,153,0.15)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inactiveBadgeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  infoValue: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  nextDateText: {
    color: colors.foreground,
    fontSize: 13,
    paddingVertical: 2,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 3,
  },
  paymentDate: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  paymentAmount: {
    color: colors.foreground,
    fontSize: 13,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
