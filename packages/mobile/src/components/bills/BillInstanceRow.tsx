import React, { useRef, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { UpcomingBillInstance } from "@derekentringer/shared/finance";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface BillInstanceRowProps {
  bill: UpcomingBillInstance;
  onPress: () => void;
  onMarkPaid: () => void;
  onUnmarkPaid: () => void;
}

export function BillInstanceRow({
  bill,
  onPress,
  onMarkPaid,
  onUnmarkPaid,
}: BillInstanceRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const handleAction = useCallback(() => {
    swipeableRef.current?.close();
    if (bill.isPaid) {
      onUnmarkPaid();
    } else {
      onMarkPaid();
    }
  }, [bill.isPaid, onMarkPaid, onUnmarkPaid]);

  const renderRightActions = () => (
    <Pressable
      style={[
        styles.swipeAction,
        bill.isPaid ? styles.unpayAction : styles.paidAction,
      ]}
      onPress={handleAction}
      accessibilityRole="button"
      accessibilityLabel={bill.isPaid ? "Unmark paid" : "Mark paid"}
    >
      <Text style={styles.swipeActionText}>
        {bill.isPaid ? "Unpay" : "Paid"}
      </Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      <Pressable
        style={styles.row}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${bill.billName}, ${formatCurrencyFull(bill.amount)}, due ${formatDate(bill.dueDate)}${bill.isOverdue ? ", overdue" : ""}`}
      >
        <View style={styles.leftSide}>
          {bill.isPaid && (
            <MaterialCommunityIcons
              name="check-circle"
              size={16}
              color={colors.success}
            />
          )}
          <Text
            style={[styles.billName, bill.isPaid && styles.billNamePaid]}
            numberOfLines={1}
          >
            {bill.billName}
          </Text>
          {bill.isOverdue && !bill.isPaid && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>Overdue</Text>
            </View>
          )}
        </View>
        <View style={styles.rightSide}>
          <Text style={styles.dateText}>{formatDate(bill.dueDate)}</Text>
          <Text style={styles.amountText}>
            {formatCurrencyFull(bill.amount)}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: spacing.sm,
  },
  billName: {
    color: colors.foreground,
    fontSize: 14,
    flex: 1,
  },
  billNamePaid: {
    color: colors.muted,
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
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateText: {
    color: colors.muted,
    fontSize: 12,
  },
  amountText: {
    color: colors.foreground,
    fontSize: 14,
  },
  swipeAction: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  paidAction: {
    backgroundColor: colors.success,
  },
  unpayAction: {
    backgroundColor: colors.muted,
  },
  swipeActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
