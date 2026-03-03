import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "@/components/common/Card";
import { formatCurrencyFull } from "@/lib/chartTheme";
import type { DashboardUpcomingBillsResponse } from "@derekentringer/shared/finance";
import { colors, spacing, borderRadius } from "@/theme";

interface UpcomingBillsListProps {
  data: DashboardUpcomingBillsResponse;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function UpcomingBillsList({ data }: UpcomingBillsListProps) {
  const { bills, overdueCount } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const filtered = data.bills.filter((b) => {
      if (b.isPaid) return false;
      const due = new Date(b.dueDate + "T00:00:00");
      return due >= today && due <= endOfMonth;
    });
    const overdue = filtered.filter((b) => b.isOverdue).length;
    return { bills: filtered, overdueCount: overdue };
  }, [data.bills]);

  if (bills.length === 0) {
    return (
      <Card>
        <Text style={styles.headerTitle}>Upcoming Bills</Text>
        <Text style={styles.emptyText}>No upcoming bills this month.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.headerTitle}>Upcoming Bills</Text>
      <View style={styles.list}>
        {bills.map((bill, i) => (
          <View
            key={`${bill.billId}-${bill.dueDate}-${i}`}
            style={[styles.row, i % 2 === 0 && styles.rowAlt]}
            accessibilityLabel={`${bill.billName}, ${formatCurrencyFull(bill.amount)}, due ${formatDate(bill.dueDate)}${bill.isOverdue ? ", overdue" : ""}`}
          >
            <View style={styles.nameContainer}>
              <Text style={styles.billName} numberOfLines={1}>{bill.billName}</Text>
              {bill.isOverdue && (
                <View style={styles.overdueBadge}>
                  <Text style={styles.overdueBadgeText}>Overdue</Text>
                </View>
              )}
            </View>
            <View style={styles.rightSide}>
              <Text style={styles.dateText}>{formatDate(bill.dueDate)}</Text>
              <Text style={styles.amountText}>{formatCurrencyFull(bill.amount)}</Text>
            </View>
          </View>
        ))}
      </View>
      {overdueCount > 0 && (
        <Text style={styles.overdueNote}>
          {overdueCount} overdue bill{overdueCount > 1 ? "s" : ""}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  rowAlt: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  nameContainer: {
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
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateText: {
    color: colors.muted,
    fontSize: 11,
  },
  amountText: {
    color: colors.foreground,
    fontSize: 13,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: spacing.xl,
    fontSize: 13,
  },
  overdueNote: {
    color: colors.error,
    fontSize: 11,
    marginTop: spacing.sm,
  },
});
