import React, { useState, useCallback, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { AccountType } from "@derekentringer/shared/finance";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { useAccounts } from "@/hooks/useAccounts";
import { HoldingsTab } from "@/components/portfolio/HoldingsTab";
import { AllocationTab } from "@/components/portfolio/AllocationTab";
import { PerformanceTab } from "@/components/portfolio/PerformanceTab";
import { RebalanceTab } from "@/components/portfolio/RebalanceTab";
import { colors, spacing, borderRadius } from "@/theme";

type Tab = "holdings" | "allocation" | "performance" | "rebalance";

const TAB_OPTIONS: Array<{ value: Tab; label: string }> = [
  { value: "holdings", label: "Holdings" },
  { value: "allocation", label: "Allocation" },
  { value: "performance", label: "Performance" },
  { value: "rebalance", label: "Rebalance" },
];

export function PortfolioScreen() {
  const route = useRoute();
  const queryClient = useQueryClient();
  const routeAccountId = (route.params as { accountId?: string } | undefined)
    ?.accountId;

  const [tab, setTab] = useState<Tab>("holdings");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<
    string | undefined
  >(routeAccountId);

  const { data: accountsData } = useAccounts();

  const investmentAccounts = useMemo(() => {
    if (!accountsData?.accounts) return [];
    return accountsData.accounts.filter(
      (a) => a.type === AccountType.Investment,
    );
  }, [accountsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["holdings"] }),
      queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
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
      {/* Account selector */}
      {investmentAccounts.length > 0 && (
        <View style={styles.accountSelector}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountChips}
          >
            <Pressable
              style={[
                styles.accountChip,
                !selectedAccountId && styles.accountChipActive,
              ]}
              onPress={() => setSelectedAccountId(undefined)}
            >
              <Text
                style={[
                  styles.accountChipText,
                  !selectedAccountId && styles.accountChipTextActive,
                ]}
              >
                All Accounts
              </Text>
            </Pressable>
            {investmentAccounts.map((acct) => (
              <Pressable
                key={acct.id}
                style={[
                  styles.accountChip,
                  selectedAccountId === acct.id && styles.accountChipActive,
                ]}
                onPress={() => setSelectedAccountId(acct.id)}
              >
                <Text
                  style={[
                    styles.accountChipText,
                    selectedAccountId === acct.id &&
                      styles.accountChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {acct.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} />

      {tab === "holdings" && <HoldingsTab accountId={selectedAccountId} />}
      {tab === "allocation" && (
        <AllocationTab accountId={selectedAccountId} />
      )}
      {tab === "performance" && (
        <PerformanceTab accountId={selectedAccountId} />
      )}
      {tab === "rebalance" && (
        <RebalanceTab accountId={selectedAccountId} />
      )}

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
  accountSelector: {
    marginBottom: -spacing.sm,
  },
  accountChips: {
    gap: spacing.xs,
  },
  accountChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  accountChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 120,
  },
  accountChipTextActive: {
    color: colors.foreground,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
