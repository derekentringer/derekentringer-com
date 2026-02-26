import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type {
  Goal,
  GoalType,
  CreateGoalRequest,
  UpdateGoalRequest,
} from "@derekentringer/shared/finance";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { PickerField } from "@/components/common/PickerField";
import { colors, spacing, borderRadius } from "@/theme";

const GOAL_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "savings", label: GOAL_TYPE_LABELS.savings },
  { value: "debt_payoff", label: GOAL_TYPE_LABELS.debt_payoff },
  { value: "net_worth", label: GOAL_TYPE_LABELS.net_worth },
  { value: "custom", label: GOAL_TYPE_LABELS.custom },
];

interface GoalFormSheetProps {
  goal?: Goal | null;
  onClose: () => void;
  onSubmit: (data: CreateGoalRequest | UpdateGoalRequest) => Promise<void>;
}

export function GoalFormSheet({ goal, onClose, onSubmit }: GoalFormSheetProps) {
  const isEdit = !!goal;
  const snapPoints = useMemo(() => ["85%"], []);

  const [name, setName] = useState(goal?.name ?? "");
  const [type, setType] = useState<GoalType>(goal?.type ?? "savings");
  const [targetAmount, setTargetAmount] = useState(
    goal?.targetAmount?.toString() ?? "",
  );
  const [startDate, setStartDate] = useState(goal?.startDate ?? "");
  const [startAmount, setStartAmount] = useState(
    goal?.startAmount?.toString() ?? "",
  );
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [priority, setPriority] = useState(goal?.priority?.toString() ?? "1");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [monthlyContribution, setMonthlyContribution] = useState(
    goal?.monthlyContribution?.toString() ?? "",
  );
  const [extraPayment, setExtraPayment] = useState(
    goal?.extraPayment?.toString() ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  const showMonthlyContribution = type === "savings" || type === "custom";
  const showExtraPayment = type === "debt_payoff";

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !targetAmount || submitting) return;
    setSubmitting(true);
    try {
      const targetAmountNum = parseFloat(targetAmount) || 0;
      const priorityNum = parseInt(priority) || 1;

      if (isEdit) {
        const data: UpdateGoalRequest = {};
        if (name !== goal!.name) data.name = name;
        if (type !== goal!.type) data.type = type;
        if (targetAmountNum !== goal!.targetAmount)
          data.targetAmount = targetAmountNum;

        const sd = startDate || null;
        if (sd !== (goal!.startDate ?? null)) data.startDate = sd;

        const sa = startAmount ? parseFloat(startAmount) : null;
        if (sa !== (goal!.startAmount ?? null)) data.startAmount = sa;

        const td = targetDate || null;
        if (td !== (goal!.targetDate ?? null)) data.targetDate = td;

        if (priorityNum !== goal!.priority) data.priority = priorityNum;

        const n = notes || null;
        if (n !== (goal!.notes ?? null)) data.notes = n;

        if (showMonthlyContribution) {
          const mc = monthlyContribution
            ? parseFloat(monthlyContribution)
            : null;
          if (mc !== (goal!.monthlyContribution ?? null))
            data.monthlyContribution = mc;
        } else if (goal!.monthlyContribution) {
          data.monthlyContribution = null;
        }

        if (showExtraPayment) {
          const ep = extraPayment ? parseFloat(extraPayment) : null;
          if (ep !== (goal!.extraPayment ?? null)) data.extraPayment = ep;
        } else if (goal!.extraPayment) {
          data.extraPayment = null;
        }

        await onSubmit(data);
      } else {
        const data: CreateGoalRequest = {
          name,
          type,
          targetAmount: targetAmountNum,
        };
        if (startDate) data.startDate = startDate;
        if (startAmount) data.startAmount = parseFloat(startAmount);
        if (targetDate) data.targetDate = targetDate;
        if (priorityNum !== 1) data.priority = priorityNum;
        if (notes) data.notes = notes;
        if (showMonthlyContribution && monthlyContribution)
          data.monthlyContribution = parseFloat(monthlyContribution);
        if (showExtraPayment && extraPayment)
          data.extraPayment = parseFloat(extraPayment);
        await onSubmit(data);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    type,
    targetAmount,
    startDate,
    startAmount,
    targetDate,
    priority,
    notes,
    monthlyContribution,
    extraPayment,
    isEdit,
    goal,
    onSubmit,
    submitting,
    showMonthlyContribution,
    showExtraPayment,
  ]);

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
        <Text style={styles.title}>
          {isEdit ? "Edit Goal" : "Add Goal"}
        </Text>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Goal name"
          autoFocus={!isEdit}
        />

        <PickerField
          label="Type"
          value={type}
          options={GOAL_TYPE_OPTIONS}
          onValueChange={(v) => setType(v as GoalType)}
        />

        <CurrencyInput
          label="Target Amount"
          value={targetAmount}
          onChangeText={setTargetAmount}
        />

        <FormField
          label="Start Date"
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
        />

        <CurrencyInput
          label="Starting Amount"
          value={startAmount}
          onChangeText={setStartAmount}
        />

        <FormField
          label="Target Date"
          value={targetDate}
          onChangeText={setTargetDate}
          placeholder="YYYY-MM-DD"
        />

        <FormField
          label="Priority"
          value={priority}
          onChangeText={setPriority}
          placeholder="1"
          keyboardType="number-pad"
        />

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
        />

        {showMonthlyContribution && (
          <CurrencyInput
            label="Monthly Contribution"
            value={monthlyContribution}
            onChangeText={setMonthlyContribution}
          />
        )}

        {showExtraPayment && (
          <CurrencyInput
            label="Extra Monthly Payment"
            value={extraPayment}
            onChangeText={setExtraPayment}
          />
        )}

        <View style={styles.buttonRow}>
          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.submitButton,
              (!name.trim() || !targetAmount || submitting) &&
                styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || !targetAmount || submitting}
            accessibilityRole="button"
          >
            <Text style={styles.submitButtonText}>
              {submitting ? "Saving..." : isEdit ? "Save" : "Create"}
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
