import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  SectionList,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type {
  Bill,
  UpcomingBillInstance,
  CreateBillRequest,
  UpdateBillRequest,
} from "@derekentringer/shared/finance";
import {
  useBills,
  useUpcomingBills,
  useCreateBill,
  useUpdateBill,
  useDeleteBill,
  useMarkBillPaid,
  useUnmarkBillPaid,
} from "@/hooks/useBills";
import { BillInstanceRow } from "@/components/bills/BillInstanceRow";
import { BillDefinitionRow } from "@/components/bills/BillDefinitionRow";
import { BillFormSheet } from "@/components/bills/BillFormSheet";
import { PinGateModal } from "@/components/common/PinGateModal";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { DateSectionHeader } from "@/components/common/DateSectionHeader";
import type { PlanningStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

type Nav = NativeStackNavigationProp<PlanningStackParamList, "BillsList">;
type TabKey = "upcoming" | "all";

function TabBar({
  active,
  onTabChange,
}: {
  active: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <View style={tabStyles.container}>
      <Pressable
        style={[tabStyles.tab, active === "upcoming" && tabStyles.tabActive]}
        onPress={() => onTabChange("upcoming")}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === "upcoming" }}
      >
        <Text
          style={[
            tabStyles.tabText,
            active === "upcoming" && tabStyles.tabTextActive,
          ]}
        >
          Upcoming
        </Text>
      </Pressable>
      <Pressable
        style={[tabStyles.tab, active === "all" && tabStyles.tabActive]}
        onPress={() => onTabChange("all")}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === "all" }}
      >
        <Text
          style={[
            tabStyles.tabText,
            active === "all" && tabStyles.tabTextActive,
          ]}
        >
          All Bills
        </Text>
      </Pressable>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: colors.primary,
  },
});

function UpcomingContent({ navigation }: { navigation: Nav }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useUpcomingBills(60);
  const markPaid = useMarkBillPaid();
  const unmarkPaid = useUnmarkBillPaid();

  const sections = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.bills].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
    const grouped = new Map<string, UpcomingBillInstance[]>();
    for (const bill of sorted) {
      const d = new Date(bill.dueDate + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(bill);
    }
    return Array.from(grouped.entries()).map(([key, bills]) => {
      const d = new Date(key + "-01T00:00:00");
      return {
        title: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        data: bills,
      };
    });
  }, [data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["bills"] });
    setRefreshing(false);
  }, [queryClient]);

  const handleMarkPaid = useCallback(
    (bill: UpcomingBillInstance) => {
      markPaid.mutate(
        { id: bill.billId, dueDate: bill.dueDate },
        {
          onSuccess: () =>
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            ),
        },
      );
    },
    [markPaid],
  );

  const handleUnmarkPaid = useCallback(
    (bill: UpcomingBillInstance) => {
      unmarkPaid.mutate({ id: bill.billId, dueDate: bill.dueDate });
    },
    [unmarkPaid],
  );

  if (isLoading) return <SkeletonChartCard height={200} />;
  if (error)
    return (
      <ErrorCard message="Failed to load bills" onRetry={() => refetch()} />
    );

  if (sections.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState message="No upcoming bills" />
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, i) => `${item.billId}-${item.dueDate}-${i}`}
      renderSectionHeader={({ section: { title } }) => (
        <DateSectionHeader title={title} />
      )}
      renderItem={({ item }) => (
        <BillInstanceRow
          bill={item}
          onPress={() =>
            navigation.navigate("BillDetail", {
              billId: item.billId,
              billName: item.billName,
            })
          }
          onMarkPaid={() => handleMarkPaid(item)}
          onUnmarkPaid={() => handleUnmarkPaid(item)}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      stickySectionHeadersEnabled
      style={styles.list}
    />
  );
}

function AllBillsContent({ navigation }: { navigation: Nav }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [formBill, setFormBill] = useState<Bill | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const { data, isLoading, error, refetch } = useBills();
  const createBill = useCreateBill();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();

  const bills = useMemo(() => {
    if (!data) return [];
    return [...data.bills].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["bills"] });
    setRefreshing(false);
  }, [queryClient]);

  const handleCreate = useCallback(
    async (formData: CreateBillRequest | UpdateBillRequest) => {
      await createBill.mutateAsync(formData as CreateBillRequest);
      setShowForm(false);
    },
    [createBill],
  );

  const handleUpdate = useCallback(
    async (formData: CreateBillRequest | UpdateBillRequest) => {
      if (!formBill) return;
      await updateBill.mutateAsync({
        id: formBill.id,
        data: formData as UpdateBillRequest,
      });
      setShowForm(false);
      setFormBill(null);
    },
    [formBill, updateBill],
  );

  const handleDeleteConfirm = useCallback((bill: Bill) => {
    Alert.alert("Delete Bill", `Delete "${bill.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setDeletingId(bill.id);
          setShowPin(true);
        },
      },
    ]);
  }, []);

  const handlePinVerified = useCallback(
    (pinToken: string) => {
      setShowPin(false);
      if (deletingId) {
        deleteBill.mutate({ id: deletingId, pinToken });
        setDeletingId(null);
      }
    },
    [deletingId, deleteBill],
  );

  if (isLoading) return <SkeletonChartCard height={200} />;
  if (error)
    return (
      <ErrorCard message="Failed to load bills" onRetry={() => refetch()} />
    );

  return (
    <View style={styles.tabContainer}>
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BillDefinitionRow
            bill={item}
            onPress={() =>
              navigation.navigate("BillDetail", {
                billId: item.id,
                billName: item.name,
              })
            }
            onEdit={() => {
              setFormBill(item);
              setShowForm(true);
            }}
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
          bills.length === 0 ? styles.emptyContainer : undefined
        }
        ListEmptyComponent={
          <EmptyState
            message="No bills yet"
            actionLabel="Add Bill"
            onAction={() => {
              setFormBill(null);
              setShowForm(true);
            }}
          />
        }
        style={styles.list}
      />

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setFormBill(null);
          setShowForm(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add bill"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#ffffff" />
      </Pressable>

      {showForm && (
        <BillFormSheet
          bill={formBill}
          onClose={() => {
            setShowForm(false);
            setFormBill(null);
          }}
          onSubmit={formBill ? handleUpdate : handleCreate}
        />
      )}

      <PinGateModal
        visible={showPin}
        onClose={() => {
          setShowPin(false);
          setDeletingId(null);
        }}
        onVerified={handlePinVerified}
        title="Delete Bill"
        description="Enter PIN to confirm deletion"
      />
    </View>
  );
}

export function BillsScreen() {
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming");
  const { data } = useBills();
  const upcomingQuery = useUpcomingBills(60);

  const remainingTotal = useMemo(() => {
    if (!upcomingQuery.data) return 0;
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return upcomingQuery.data.bills
      .filter((b) => {
        if (b.isPaid) return false;
        const due = new Date(b.dueDate + "T00:00:00");
        return due <= endOfMonth;
      })
      .reduce((sum, b) => sum + b.amount, 0);
  }, [upcomingQuery.data]);

  const monthlyTotal = useMemo(() => {
    if (!data) return 0;
    return data.bills
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
  }, [data]);

  return (
    <View style={styles.container}>
      {data && data.bills.length > 0 && (
        <View style={styles.totalBanner}>
          <Text style={styles.totalBannerLabel}>
            Monthly Total:{" "}
            <Text style={styles.totalBannerAmount}>
              {formatCurrencyFull(monthlyTotal)}
            </Text>
          </Text>
          <Text style={styles.totalBannerLabel}>
            Remaining:{" "}
            <Text style={styles.totalBannerAmount}>
              {formatCurrencyFull(remainingTotal)}
            </Text>
          </Text>
        </View>
      )}
      <TabBar active={activeTab} onTabChange={setActiveTab} />
      {activeTab === "upcoming" ? (
        <UpcomingContent navigation={navigation} />
      ) : (
        <AllBillsContent navigation={navigation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContainer: {
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
  totalBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: "flex-end",
  },
  totalBannerLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  totalBannerAmount: {
    color: colors.error,
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
