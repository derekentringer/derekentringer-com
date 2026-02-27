import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { NotificationType } from "@derekentringer/shared/finance";
import type { NotificationPreference } from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { colors, spacing, borderRadius } from "@/theme";

interface NotificationConfigSheetProps {
  preference: NotificationPreference;
  onClose: () => void;
  onSubmit: (config: Record<string, unknown>) => Promise<void>;
}

export function NotificationConfigSheet({
  preference,
  onClose,
  onSubmit,
}: NotificationConfigSheetProps) {
  const snapPoints = useMemo(() => ["60%"], []);
  const config = (preference.config ?? {}) as Record<string, unknown>;
  const [submitting, setSubmitting] = useState(false);

  // State for each config type
  const [reminderDays, setReminderDays] = useState(
    String((config.reminderDaysBefore as number) ?? 3),
  );
  const [thresholds, setThresholds] = useState(
    ((config.thresholds as number[]) ?? [50, 75, 90]).join(", "),
  );
  const [warnPercent, setWarnPercent] = useState(
    String((config.warnAtPercent as number) ?? 80),
  );
  const [alertPercent, setAlertPercent] = useState(
    String((config.alertAtPercent as number) ?? 100),
  );
  const [largeThreshold, setLargeThreshold] = useState(
    String((config.threshold as number) ?? 500),
  );
  const [netWorthMilestones, setNetWorthMilestones] = useState(
    ((config.netWorthMilestones as number[]) ?? [50000, 100000, 250000]).join(", "),
  );
  const [loanPayoffMilestones, setLoanPayoffMilestones] = useState(
    ((config.loanPayoffPercentMilestones as number[]) ?? [25, 50, 75]).join(", "),
  );
  const [fallbackDay, setFallbackDay] = useState(
    String((config.fallbackDayOfMonth as number) ?? 1),
  );

  const handleSave = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let newConfig: Record<string, unknown> = {};

      switch (preference.type) {
        case NotificationType.BillDue:
        case NotificationType.CreditPaymentDue:
        case NotificationType.LoanPaymentDue:
          newConfig = { reminderDaysBefore: parseInt(reminderDays) || 3 };
          break;
        case NotificationType.HighCreditUtilization:
          newConfig = {
            thresholds: thresholds
              .split(",")
              .map((s) => parseInt(s.trim()))
              .filter((n) => !isNaN(n)),
          };
          break;
        case NotificationType.BudgetOverspend:
          newConfig = {
            warnAtPercent: parseInt(warnPercent) || 80,
            alertAtPercent: parseInt(alertPercent) || 100,
          };
          break;
        case NotificationType.LargeTransaction:
          newConfig = { threshold: parseFloat(largeThreshold) || 500 };
          break;
        case NotificationType.StatementReminder:
          newConfig = {
            reminderDaysBefore: parseInt(reminderDays) || 3,
            fallbackDayOfMonth: parseInt(fallbackDay) || 1,
          };
          break;
        case NotificationType.Milestones:
          newConfig = {
            netWorthMilestones: netWorthMilestones
              .split(",")
              .map((s) => parseInt(s.trim()))
              .filter((n) => !isNaN(n)),
            loanPayoffPercentMilestones: loanPayoffMilestones
              .split(",")
              .map((s) => parseInt(s.trim()))
              .filter((n) => !isNaN(n)),
          };
          break;
      }

      await onSubmit(newConfig);
    } finally {
      setSubmitting(false);
    }
  }, [
    preference.type,
    reminderDays,
    thresholds,
    warnPercent,
    alertPercent,
    largeThreshold,
    netWorthMilestones,
    loanPayoffMilestones,
    fallbackDay,
    submitting,
    onSubmit,
  ]);

  const renderFields = () => {
    switch (preference.type) {
      case NotificationType.BillDue:
      case NotificationType.CreditPaymentDue:
      case NotificationType.LoanPaymentDue:
        return (
          <FormField
            label="Days Before Due"
            value={reminderDays}
            onChangeText={setReminderDays}
            keyboardType="number-pad"
          />
        );
      case NotificationType.HighCreditUtilization:
        return (
          <FormField
            label="Thresholds (comma-separated %)"
            value={thresholds}
            onChangeText={setThresholds}
            placeholder="50, 75, 90"
          />
        );
      case NotificationType.BudgetOverspend:
        return (
          <>
            <FormField
              label="Warn at %"
              value={warnPercent}
              onChangeText={setWarnPercent}
              keyboardType="number-pad"
            />
            <FormField
              label="Alert at %"
              value={alertPercent}
              onChangeText={setAlertPercent}
              keyboardType="number-pad"
            />
          </>
        );
      case NotificationType.LargeTransaction:
        return (
          <CurrencyInput
            label="Threshold Amount"
            value={largeThreshold}
            onChangeText={setLargeThreshold}
          />
        );
      case NotificationType.StatementReminder:
        return (
          <>
            <FormField
              label="Days Before Due"
              value={reminderDays}
              onChangeText={setReminderDays}
              keyboardType="number-pad"
            />
            <FormField
              label="Fallback Day of Month"
              value={fallbackDay}
              onChangeText={setFallbackDay}
              keyboardType="number-pad"
            />
          </>
        );
      case NotificationType.Milestones:
        return (
          <>
            <FormField
              label="Net Worth Milestones (comma-separated $)"
              value={netWorthMilestones}
              onChangeText={setNetWorthMilestones}
              placeholder="50000, 100000, 250000"
            />
            <FormField
              label="Loan Payoff % Milestones (comma-separated)"
              value={loanPayoffMilestones}
              onChangeText={setLoanPayoffMilestones}
              placeholder="25, 50, 75"
            />
          </>
        );
      default:
        return (
          <Text style={styles.noConfig}>
            No configuration options for this notification type.
          </Text>
        );
    }
  };

  return (
    <BottomSheet
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Configure</Text>

        {renderFields()}

        <View style={styles.buttonRow}>
          <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSave}
            disabled={submitting}
            accessibilityRole="button"
          >
            <Text style={styles.submitButtonText}>
              {submitting ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.card,
  },
  handle: {
    backgroundColor: colors.muted,
    width: 40,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  noConfig: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  submitButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
});
