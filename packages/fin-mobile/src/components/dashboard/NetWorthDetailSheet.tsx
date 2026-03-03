import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { NetWorthResponse } from "@derekentringer/shared/finance";
import { formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

interface NetWorthDetailSheetProps {
  data: NetWorthResponse;
  onClose: () => void;
}

export function NetWorthDetailSheet({ data, onClose }: NetWorthDetailSheetProps) {
  const snapPoints = useMemo(() => ["60%", "85%"], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const { summary } = data;

  const assets = summary.accounts.filter((a) => a.classification === "asset");
  const liabilities = summary.accounts.filter((a) => a.classification === "liability");

  // Compute change from previous balances
  const prevNetWorth = summary.accounts.reduce((sum, a) => {
    const prev = a.previousBalance ?? a.balance;
    return sum + (a.classification === "asset" ? prev : a.classification === "liability" ? -prev : 0);
  }, 0);
  const netWorthChange = summary.netWorth - prevNetWorth;
  const netWorthChangePct = prevNetWorth !== 0 ? (netWorthChange / Math.abs(prevNetWorth)) * 100 : 0;

  return (
    <BottomSheet
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.sheetTitle}>Net Worth</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.heroValue}>{formatCurrency(summary.netWorth)}</Text>
          {netWorthChange !== 0 && (
            <Text
              style={[
                styles.changeText,
                netWorthChange > 0 ? styles.changePositive : styles.changeNegative,
              ]}
            >
              {netWorthChange > 0 ? "\u2191" : "\u2193"} {formatCurrency(Math.abs(netWorthChange))} ({Math.abs(netWorthChangePct).toFixed(1)}%)
            </Text>
          )}
        </View>

        <View style={styles.summaryCards}>
          <View style={[styles.summaryCard, styles.assetCard]}>
            <Text style={styles.summaryCardLabel}>Assets</Text>
            <Text style={[styles.summaryCardValue, { color: "#22c55e" }]}>
              {formatCurrency(summary.totalAssets)}
            </Text>
          </View>
          <View style={[styles.summaryCard, styles.liabilityCard]}>
            <Text style={styles.summaryCardLabel}>Liabilities</Text>
            <Text style={[styles.summaryCardValue, { color: "#ef4444" }]}>
              {formatCurrency(summary.totalLiabilities)}
            </Text>
          </View>
        </View>

        {/* Assets breakdown */}
        {assets.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: "#34d399" }]}>Assets</Text>
              <Text style={[styles.sectionTotal, { color: "#34d399" }]}>
                {formatCurrency(summary.totalAssets)}
              </Text>
            </View>
            {assets.map((account) => {
              const change = account.previousBalance != null ? account.balance - account.previousBalance : 0;
              return (
                <View
                  key={account.id}
                  style={styles.accountRow}
                  accessibilityLabel={`${account.name}: ${formatCurrency(account.balance)}`}
                >
                  <View style={styles.accountLeft}>
                    <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                    <Text style={styles.accountType}>{formatAccountType(account.type)}</Text>
                  </View>
                  <View style={styles.accountRight}>
                    <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
                    {change !== 0 && (
                      <Text
                        style={[
                          styles.accountChange,
                          change > 0 ? styles.changePositive : styles.changeNegative,
                        ]}
                      >
                        {change > 0 ? "+" : ""}{formatCurrency(change)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Liabilities breakdown */}
        {liabilities.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: "#f87171" }]}>Liabilities</Text>
              <Text style={[styles.sectionTotal, { color: "#f87171" }]}>
                {formatCurrency(summary.totalLiabilities)}
              </Text>
            </View>
            {liabilities.map((account) => {
              const change = account.previousBalance != null ? account.balance - account.previousBalance : 0;
              return (
                <View
                  key={account.id}
                  style={styles.accountRow}
                  accessibilityLabel={`${account.name}: ${formatCurrency(account.balance)}`}
                >
                  <View style={styles.accountLeft}>
                    <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                    <Text style={styles.accountType}>{formatAccountType(account.type)}</Text>
                  </View>
                  <View style={styles.accountRight}>
                    <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
                    {change !== 0 && (
                      <Text
                        style={[
                          styles.accountChange,
                          change < 0 ? styles.changePositive : styles.changeNegative,
                        ]}
                      >
                        {change > 0 ? "+" : ""}{formatCurrency(change)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function formatAccountType(type: string): string {
  const labels: Record<string, string> = {
    checking: "Checking",
    savings: "Savings",
    high_yield_savings: "High-Yield Savings",
    credit: "Credit Card",
    investment: "Investment",
    loan: "Loan",
    real_estate: "Real Estate",
    other: "Other",
  };
  return labels[type] ?? type;
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    backgroundColor: colors.muted,
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  sheetTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
  },
  summaryRow: {
    gap: 4,
  },
  heroValue: {
    color: colors.foreground,
    fontSize: 32,
    fontWeight: "700",
  },
  changeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  changePositive: {
    color: "#22c55e",
  },
  changeNegative: {
    color: "#ef4444",
  },
  summaryCards: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: spacing.sm,
    gap: 4,
  },
  assetCard: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  liabilityCard: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  summaryCardLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  summaryCardValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  section: {
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  sectionTotal: {
    fontSize: 14,
    fontWeight: "600",
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  accountLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: spacing.sm,
  },
  accountName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  accountType: {
    color: colors.muted,
    fontSize: 11,
  },
  accountRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  accountBalance: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  accountChange: {
    fontSize: 11,
    fontWeight: "500",
  },
});
