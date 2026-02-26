import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import type { DTIResponse } from "@derekentringer/shared/finance";
import { formatCurrency } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface DtiDetailSheetProps {
  data: DTIResponse;
  onClose: () => void;
}

function ratingColor(ratio: number): string {
  if (ratio > 43) return "#ef4444";
  if (ratio > 36) return "#facc15";
  return "#22c55e";
}

function ratingLabel(ratio: number): string {
  if (ratio > 43) return "High";
  if (ratio > 36) return "Moderate";
  return "Good";
}

export function DtiDetailSheet({ data, onClose }: DtiDetailSheetProps) {
  const snapPoints = useMemo(() => ["60%", "85%"], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const color = ratingColor(data.ratio);

  return (
    <BottomSheet
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.sheetTitle}>Debt-to-Income Ratio</Text>

        <View style={styles.summaryRow}>
          <Text style={[styles.ratioValue, { color }]}>{data.ratio.toFixed(1)}%</Text>
          <Text style={[styles.ratingLabel, { color }]}>{ratingLabel(data.ratio)}</Text>
        </View>

        <Text style={styles.formula}>
          {formatCurrency(data.monthlyDebtPayments)} debt / {formatCurrency(data.grossMonthlyIncome)} income
        </Text>

        {/* Debt Components */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: "#f87171" }]}>Monthly Debt Payments</Text>
            <Text style={[styles.sectionTotal, { color: "#f87171" }]}>
              {formatCurrency(data.monthlyDebtPayments)}
            </Text>
          </View>
          {data.debtComponents.length === 0 ? (
            <Text style={styles.emptyText}>No debt payments found</Text>
          ) : (
            data.debtComponents.map((c, i) => (
              <View key={i} style={styles.componentRow} accessibilityLabel={`${c.name}: ${formatCurrency(c.amount)}`}>
                <View style={styles.componentLeft}>
                  <Text style={styles.componentName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.componentType}>
                    {c.type === "loan" ? "Loan" : c.type === "credit" ? "Credit" : "Bill"}
                    {c.dtiPercentage != null && c.dtiPercentage !== 100 && ` (${c.dtiPercentage}%)`}
                  </Text>
                </View>
                <Text style={styles.componentAmount}>{formatCurrency(c.amount)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Income Components */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: "#34d399" }]}>Gross Monthly Income</Text>
            <Text style={[styles.sectionTotal, { color: "#34d399" }]}>
              {formatCurrency(data.grossMonthlyIncome)}
            </Text>
          </View>
          {data.incomeComponents.length === 0 ? (
            <Text style={styles.emptyText}>No income sources found</Text>
          ) : (
            data.incomeComponents.map((c, i) => (
              <View key={i} style={styles.componentRow} accessibilityLabel={`${c.name}: ${formatCurrency(c.amount)}`}>
                <View style={styles.componentLeft}>
                  <Text style={styles.componentName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.componentType}>
                    {c.type === "manual" ? "Manual" : "Detected"}
                  </Text>
                </View>
                <Text style={styles.componentAmount}>{formatCurrency(c.amount)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Threshold key */}
        <View style={styles.thresholds}>
          <Text style={[styles.thresholdText, { color: "#22c55e" }]}>Good: ≤ 36%</Text>
          <Text style={[styles.thresholdText, { color: "#facc15" }]}>Moderate: 36–43%</Text>
          <Text style={[styles.thresholdText, { color: "#ef4444" }]}>High: &gt; 43%</Text>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  sheetTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  ratioValue: {
    fontSize: 32,
    fontWeight: "700",
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  formula: {
    color: colors.muted,
    fontSize: 12,
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
  componentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  componentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: spacing.sm,
  },
  componentName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  componentType: {
    color: colors.muted,
    fontSize: 11,
  },
  componentAmount: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
  },
  thresholds: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  thresholdText: {
    fontSize: 11,
  },
});
