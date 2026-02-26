import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type {
  Budget,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "@derekentringer/shared/finance";
import { useCategories } from "@/hooks/useTransactions";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { PickerField } from "@/components/common/PickerField";
import { FormField } from "@/components/common/FormField";
import { colors, spacing, borderRadius } from "@/theme";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  const options: Array<{ value: string; label: string }> = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label });
  }
  return options;
}

interface BudgetFormSheetProps {
  budget?: Budget | null;
  onClose: () => void;
  onSubmit: (data: CreateBudgetRequest | UpdateBudgetRequest) => Promise<void>;
}

export function BudgetFormSheet({
  budget,
  onClose,
  onSubmit,
}: BudgetFormSheetProps) {
  const isEdit = !!budget;
  const snapPoints = useMemo(() => ["60%"], []);

  const [category, setCategory] = useState(budget?.category ?? "");
  const [amount, setAmount] = useState(budget?.amount?.toString() ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    budget?.effectiveFrom ?? getCurrentMonth(),
  );
  const [notes, setNotes] = useState(budget?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const categoriesQuery = useCategories();
  const monthOptions = useMemo(getMonthOptions, []);

  const categoryOptions = useMemo(() => {
    if (!categoriesQuery.data) return [];
    return categoriesQuery.data.categories.map((c) => ({
      value: c.name,
      label: c.name,
    }));
  }, [categoriesQuery.data]);

  const effectiveMonthLabel = useMemo(() => {
    if (!effectiveFrom) return "";
    const [y, m] = effectiveFrom.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [effectiveFrom]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!isEdit && !category) return;
    if (!amount) return;

    setSubmitting(true);
    try {
      if (isEdit) {
        const data: UpdateBudgetRequest = {};
        const amountNum = parseFloat(amount) || 0;
        if (amountNum !== budget!.amount) data.amount = amountNum;
        const n = notes || null;
        if (n !== (budget!.notes ?? null)) data.notes = n;
        await onSubmit(data);
      } else {
        const data: CreateBudgetRequest = {
          category,
          amount: parseFloat(amount) || 0,
          effectiveFrom,
        };
        if (notes) data.notes = notes;
        await onSubmit(data);
      }
    } finally {
      setSubmitting(false);
    }
  }, [category, amount, effectiveFrom, notes, isEdit, budget, onSubmit, submitting]);

  const canSubmit = isEdit
    ? !!amount
    : !!category && !!amount;

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
          {isEdit ? "Edit Budget" : "Add Budget"}
        </Text>

        {isEdit ? (
          <View style={styles.disabledField}>
            <Text style={styles.disabledLabel}>Category</Text>
            <Text style={styles.disabledValue}>{budget!.category}</Text>
          </View>
        ) : (
          <PickerField
            label="Category"
            value={category}
            options={categoryOptions}
            onValueChange={setCategory}
            placeholder="Select category"
          />
        )}

        <CurrencyInput
          label="Monthly Budget"
          value={amount}
          onChangeText={setAmount}
        />

        {!isEdit && (
          <PickerField
            label="Effective From"
            value={effectiveFrom}
            options={monthOptions}
            onValueChange={setEffectiveFrom}
          />
        )}

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
        />

        {effectiveFrom && (
          <Text style={styles.helperText}>
            This budget applies starting {effectiveMonthLabel} and continues
            until you change it.
          </Text>
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
              (!canSubmit || submitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
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
  disabledField: {
    marginBottom: spacing.sm,
  },
  disabledLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  disabledValue: {
    color: colors.muted,
    fontSize: 15,
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: spacing.sm,
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
