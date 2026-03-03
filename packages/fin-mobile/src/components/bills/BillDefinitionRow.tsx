import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Bill } from "@derekentringer/shared/finance";
import { BILL_FREQUENCY_LABELS } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface BillDefinitionRowProps {
  bill: Bill;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function BillDefinitionRow({
  bill,
  onPress,
  onEdit,
  onDelete,
}: BillDefinitionRowProps) {
  return (
    <SwipeableRow onEdit={onEdit} onDelete={onDelete}>
      <Pressable
        style={[styles.row, !bill.isActive && styles.rowInactive]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${bill.name}, ${formatCurrencyFull(bill.amount)}, ${BILL_FREQUENCY_LABELS[bill.frequency]}`}
      >
        <View style={styles.leftSide}>
          <Text
            style={[styles.billName, !bill.isActive && styles.textInactive]}
            numberOfLines={1}
          >
            {bill.name}
          </Text>
          <View style={styles.frequencyBadge}>
            <Text style={styles.frequencyBadgeText}>
              {BILL_FREQUENCY_LABELS[bill.frequency]}
            </Text>
          </View>
        </View>
        <View style={styles.rightSide}>
          <Text
            style={[styles.amountText, !bill.isActive && styles.textInactive]}
          >
            {formatCurrencyFull(bill.amount)}
          </Text>
          {!bill.isActive && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowInactive: {
    opacity: 0.5,
  },
  leftSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: spacing.sm,
  },
  billName: {
    color: colors.foreground,
    fontSize: 14,
    flex: 1,
  },
  textInactive: {
    color: colors.muted,
  },
  frequencyBadge: {
    backgroundColor: "rgba(37,99,235,0.15)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  frequencyBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "600",
  },
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountText: {
    color: colors.foreground,
    fontSize: 14,
  },
  inactiveBadge: {
    backgroundColor: "rgba(153,153,153,0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  inactiveBadgeText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "600",
  },
});
