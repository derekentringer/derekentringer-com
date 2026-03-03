import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { IncomeSpendingResponse } from "@derekentringer/shared/finance";
import { formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

interface IncomeDetailSheetProps {
  mtdData: IncomeSpendingResponse | undefined;
  yearlyData: IncomeSpendingResponse | undefined;
  onClose: () => void;
}

export function IncomeDetailSheet({ mtdData, yearlyData, onClose }: IncomeDetailSheetProps) {
  const snapPoints = useMemo(() => ["50%", "80%"], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const mtdTotal = mtdData
    ? mtdData.points.reduce((s, p) => s + p.income, 0)
    : 0;

  const mtdSpending = mtdData
    ? mtdData.points.reduce((s, p) => s + p.spending, 0)
    : 0;

  const mtdNet = mtdTotal - mtdSpending;

  // Compute per-month income from yearly data (last 6 months)
  const monthlyBreakdown = useMemo(() => {
    if (!yearlyData || yearlyData.points.length === 0) return [];
    const recent = yearlyData.points.slice(-6);
    return recent.map((p) => ({
      date: p.date,
      income: p.income,
      spending: p.spending,
      net: p.income - p.spending,
    }));
  }, [yearlyData]);

  // Average monthly income
  const avgMonthlyIncome = monthlyBreakdown.length > 0
    ? monthlyBreakdown.reduce((s, m) => s + m.income, 0) / monthlyBreakdown.length
    : 0;

  return (
    <BottomSheet
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.sheetTitle}>Monthly Income</Text>

        <View style={styles.heroSection}>
          <Text style={styles.heroValue}>{formatCurrency(mtdTotal)}</Text>
          <Text style={styles.heroSubtitle}>Month to Date</Text>
        </View>

        {/* MTD Summary */}
        <View style={styles.summaryCards}>
          <View style={[styles.summaryCard, styles.incomeCard]}>
            <Text style={styles.summaryCardLabel}>Income</Text>
            <Text style={[styles.summaryCardValue, { color: "#22c55e" }]}>
              {formatCurrency(mtdTotal)}
            </Text>
          </View>
          <View style={[styles.summaryCard, styles.spendingCard]}>
            <Text style={styles.summaryCardLabel}>Spending</Text>
            <Text style={[styles.summaryCardValue, { color: "#ef4444" }]}>
              {formatCurrency(mtdSpending)}
            </Text>
          </View>
          <View style={[styles.summaryCard, styles.netCard]}>
            <Text style={styles.summaryCardLabel}>Net</Text>
            <Text
              style={[
                styles.summaryCardValue,
                { color: mtdNet >= 0 ? "#22c55e" : "#ef4444" },
              ]}
            >
              {formatCurrency(mtdNet)}
            </Text>
          </View>
        </View>

        {avgMonthlyIncome > 0 && (
          <View style={styles.avgRow}>
            <Text style={styles.avgLabel}>6-Month Average</Text>
            <Text style={styles.avgValue}>{formatCurrency(avgMonthlyIncome)}/mo</Text>
          </View>
        )}

        {/* Monthly history */}
        {monthlyBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Months</Text>
            {[...monthlyBreakdown].reverse().map((m) => (
              <View key={m.date} style={styles.monthRow}>
                <Text style={styles.monthDate}>{formatMonth(m.date)}</Text>
                <View style={styles.monthValues}>
                  <Text style={[styles.monthIncome, { color: "#22c55e" }]}>
                    {formatCurrency(m.income)}
                  </Text>
                  <Text style={[styles.monthSpending, { color: "#ef4444" }]}>
                    -{formatCurrency(m.spending)}
                  </Text>
                  <Text
                    style={[
                      styles.monthNet,
                      { color: m.net >= 0 ? "#22c55e" : "#ef4444" },
                    ]}
                  >
                    {m.net >= 0 ? "+" : ""}{formatCurrency(m.net)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
  heroSection: {
    gap: 4,
  },
  heroValue: {
    color: colors.foreground,
    fontSize: 32,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 12,
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
  incomeCard: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  spendingCard: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  netCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  summaryCardLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  summaryCardValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  avgLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  avgValue: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthDate: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    width: 80,
  },
  monthValues: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  monthIncome: {
    fontSize: 12,
    fontWeight: "500",
    width: 70,
    textAlign: "right",
  },
  monthSpending: {
    fontSize: 12,
    fontWeight: "500",
    width: 70,
    textAlign: "right",
  },
  monthNet: {
    fontSize: 12,
    fontWeight: "600",
    width: 70,
    textAlign: "right",
  },
});
