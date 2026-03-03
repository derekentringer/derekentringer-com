import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { SpendingSummary } from "@derekentringer/shared/finance";
import { formatCurrency, getCategoryColor } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

interface SpendingDetailSheetProps {
  data: SpendingSummary;
  onClose: () => void;
}

export function SpendingDetailSheet({ data, onClose }: SpendingDetailSheetProps) {
  const snapPoints = useMemo(() => ["55%", "85%"], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const sorted = useMemo(
    () => [...data.categories].sort((a, b) => b.amount - a.amount),
    [data.categories],
  );

  const topCategory = sorted.length > 0 ? sorted[0] : null;

  return (
    <BottomSheet
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.sheetTitle}>Monthly Spending</Text>

        <View style={styles.heroSection}>
          <Text style={styles.heroValue}>{formatCurrency(data.total)}</Text>
          <Text style={styles.heroSubtitle}>
            {formatMonthLabel(data.month)} — {data.categories.length} categories
          </Text>
        </View>

        {topCategory && (
          <View style={styles.highlightRow}>
            <Text style={styles.highlightLabel}>Top Category</Text>
            <Text style={styles.highlightValue}>
              {topCategory.category} ({topCategory.percentage.toFixed(0)}%)
            </Text>
          </View>
        )}

        {/* Category breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Category</Text>
          {sorted.map((cat, i) => (
            <View
              key={cat.category}
              style={styles.categoryRow}
              accessibilityLabel={`${cat.category}: ${formatCurrency(cat.amount)}, ${cat.percentage.toFixed(1)}%`}
            >
              <View style={styles.categoryLeft}>
                <View style={[styles.colorDot, { backgroundColor: getCategoryColor(i) }]} />
                <Text style={styles.categoryName} numberOfLines={1}>{cat.category}</Text>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                <Text style={styles.categoryPct}>{cat.percentage.toFixed(1)}%</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Visual bar breakdown */}
        {sorted.length > 0 && (
          <View style={styles.barContainer}>
            {sorted.map((cat, i) => (
              <View
                key={cat.category}
                style={[
                  styles.barSegment,
                  {
                    flex: cat.percentage,
                    backgroundColor: getCategoryColor(i),
                  },
                ]}
              />
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function formatMonthLabel(month: string): string {
  const d = new Date(month + "-01T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
  highlightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: spacing.sm,
  },
  highlightLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  highlightValue: {
    color: colors.foreground,
    fontSize: 13,
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
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: spacing.sm,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    color: colors.foreground,
    fontSize: 13,
    flex: 1,
  },
  categoryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryAmount: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    width: 80,
    textAlign: "right",
  },
  categoryPct: {
    color: colors.muted,
    fontSize: 12,
    width: 45,
    textAlign: "right",
  },
  barContainer: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    gap: 2,
  },
  barSegment: {
    borderRadius: 4,
  },
});
