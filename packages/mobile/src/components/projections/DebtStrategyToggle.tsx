import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";
import type { DebtPayoffResponse } from "@derekentringer/shared/finance";

interface DebtStrategyToggleProps {
  data: DebtPayoffResponse;
  extraPayment: number;
}

export function DebtStrategyToggle({ data, extraPayment }: DebtStrategyToggleProps) {
  const totalDebt = useMemo(() => {
    return data.debtAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  }, [data.debtAccounts]);

  const debtFreeDate = useMemo(() => {
    const best = data.avalanche.debtFreeDate ?? data.snowball.debtFreeDate;
    if (!best) return "N/A";
    return new Date(best + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }, [data.avalanche.debtFreeDate, data.snowball.debtFreeDate]);

  const interestSaved = useMemo(() => {
    const worst = Math.max(
      data.avalanche.totalInterestPaid,
      data.snowball.totalInterestPaid,
    );
    const best = Math.min(
      data.avalanche.totalInterestPaid,
      data.snowball.totalInterestPaid,
    );
    return worst - best;
  }, [data.avalanche.totalInterestPaid, data.snowball.totalInterestPaid]);

  const monthlyPayment = useMemo(() => {
    const totalMinimum = data.debtAccounts.reduce(
      (sum, a) => sum + a.minimumPayment,
      0,
    );
    return totalMinimum + extraPayment;
  }, [data.debtAccounts, extraPayment]);

  return (
    <View style={styles.kpiGrid}>
      <View style={styles.kpiItem}>
        <Text style={styles.kpiLabel}>Total Debt</Text>
        <Text style={[styles.kpiValue, { color: colors.error }]}>
          {formatCurrencyFull(totalDebt)}
        </Text>
      </View>
      <View style={styles.kpiItem}>
        <Text style={styles.kpiLabel}>Debt-Free Date</Text>
        <Text style={[styles.kpiValue, { color: colors.success }]}>
          {debtFreeDate}
        </Text>
      </View>
      <View style={styles.kpiItem}>
        <Text style={styles.kpiLabel}>Interest Saved</Text>
        <Text style={styles.kpiValue}>
          {formatCurrencyFull(interestSaved)}
        </Text>
      </View>
      <View style={styles.kpiItem}>
        <Text style={styles.kpiLabel}>Monthly Payment</Text>
        <Text style={styles.kpiValue}>
          {formatCurrencyFull(monthlyPayment)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  kpiItem: {
    width: "48%",
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  kpiValue: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
});
