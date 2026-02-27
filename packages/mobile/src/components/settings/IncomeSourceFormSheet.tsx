import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Switch, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type {
  IncomeSource,
  IncomeSourceFrequency,
  DetectedIncomePattern,
} from "@derekentringer/shared/finance";
import { INCOME_SOURCE_FREQUENCY_LABELS } from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { PickerField } from "@/components/common/PickerField";
import { colors, spacing, borderRadius } from "@/theme";

const FREQUENCY_OPTIONS: Array<{ value: string; label: string }> = Object.entries(
  INCOME_SOURCE_FREQUENCY_LABELS,
).map(([value, label]) => ({ value, label }));

interface IncomeSourceFormSheetProps {
  incomeSource?: IncomeSource | null;
  detectedPatterns?: DetectedIncomePattern[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    amount: number;
    frequency: IncomeSourceFrequency;
    isActive?: boolean;
    notes?: string | null;
  }) => Promise<void>;
}

export function IncomeSourceFormSheet({
  incomeSource,
  detectedPatterns,
  onClose,
  onSubmit,
}: IncomeSourceFormSheetProps) {
  const isEdit = !!incomeSource;
  const snapPoints = useMemo(() => ["85%"], []);

  const [name, setName] = useState(incomeSource?.name ?? "");
  const [amount, setAmount] = useState(incomeSource?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState<IncomeSourceFrequency>(
    incomeSource?.frequency ?? "monthly",
  );
  const [isActive, setIsActive] = useState(incomeSource?.isActive ?? true);
  const [notes, setNotes] = useState(incomeSource?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleDetectedSelect = useCallback((pattern: DetectedIncomePattern) => {
    setName(pattern.description);
    setAmount(pattern.averageAmount.toFixed(2));
    setFrequency(pattern.frequency);
  }, []);

  const handleSubmit = useCallback(async () => {
    const amountNum = parseFloat(amount);
    if (!name.trim() || !amountNum || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount: amountNum,
        frequency,
        isActive,
        notes: notes.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  }, [name, amount, frequency, isActive, notes, submitting, onSubmit]);

  const canSubmit = name.trim() && parseFloat(amount) > 0;

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
          {isEdit ? "Edit Income Source" : "Add Income Source"}
        </Text>

        {!isEdit && detectedPatterns && detectedPatterns.length > 0 && (
          <View style={styles.detectedSection}>
            <Text style={styles.detectedTitle}>Detected Patterns</Text>
            {detectedPatterns.map((p, i) => (
              <Pressable
                key={i}
                style={styles.detectedRow}
                onPress={() => handleDetectedSelect(p)}
                accessibilityRole="button"
              >
                <Text style={styles.detectedName} numberOfLines={1}>
                  {p.description}
                </Text>
                <Text style={styles.detectedAmount}>
                  ${p.averageAmount.toFixed(0)} / {p.frequency}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Income source name"
          autoFocus={!isEdit && (!detectedPatterns || detectedPatterns.length === 0)}
        />

        <CurrencyInput
          label="Amount"
          value={amount}
          onChangeText={setAmount}
        />

        <PickerField
          label="Frequency"
          value={frequency}
          options={FREQUENCY_OPTIONS}
          onValueChange={(v) => setFrequency(v as IncomeSourceFrequency)}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
        />

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
  detectedSection: {
    marginBottom: spacing.md,
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  detectedTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  detectedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detectedName: {
    color: colors.primary,
    fontSize: 13,
    flex: 1,
  },
  detectedAmount: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "500",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  switchLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
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
