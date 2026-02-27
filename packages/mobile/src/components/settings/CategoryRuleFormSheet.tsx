import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Switch, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { CategoryRule, RuleMatchType } from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { PickerField } from "@/components/common/PickerField";
import { useCategories } from "@/hooks/useCategories";
import { colors, spacing, borderRadius } from "@/theme";

const MATCH_TYPE_OPTIONS = [
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact Match" },
];

interface CategoryRuleFormSheetProps {
  rule?: CategoryRule | null;
  onClose: () => void;
  onSubmit: (data: {
    pattern: string;
    matchType: RuleMatchType;
    category: string;
    priority?: number;
  }, apply: boolean) => Promise<void>;
}

export function CategoryRuleFormSheet({ rule, onClose, onSubmit }: CategoryRuleFormSheetProps) {
  const isEdit = !!rule;
  const snapPoints = useMemo(() => ["85%"], []);

  const { data: categoriesData } = useCategories();
  const categoryOptions = useMemo(
    () =>
      (categoriesData?.categories ?? []).map((c) => ({
        value: c.name,
        label: c.name,
      })),
    [categoriesData],
  );

  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [matchType, setMatchType] = useState<RuleMatchType>(rule?.matchType ?? "contains");
  const [category, setCategory] = useState(rule?.category ?? "");
  const [priority, setPriority] = useState(rule?.priority?.toString() ?? "0");
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!pattern.trim() || !category || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(
        {
          pattern: pattern.trim(),
          matchType,
          category,
          priority: parseInt(priority) || 0,
        },
        applyToExisting,
      );
    } finally {
      setSubmitting(false);
    }
  }, [pattern, matchType, category, priority, applyToExisting, submitting, onSubmit]);

  const canSubmit = pattern.trim() && category;

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
          {isEdit ? "Edit Rule" : "Add Rule"}
        </Text>

        <FormField
          label="Pattern"
          value={pattern}
          onChangeText={setPattern}
          placeholder="Text to match in description"
          autoFocus={!isEdit}
        />

        <PickerField
          label="Match Type"
          value={matchType}
          options={MATCH_TYPE_OPTIONS}
          onValueChange={(v) => setMatchType(v as RuleMatchType)}
        />

        <PickerField
          label="Category"
          value={category}
          options={categoryOptions}
          onValueChange={setCategory}
          placeholder="Select category..."
        />

        <FormField
          label="Priority"
          value={priority}
          onChangeText={setPriority}
          placeholder="0"
          keyboardType="number-pad"
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Apply to existing transactions</Text>
          <Switch
            value={applyToExisting}
            onValueChange={setApplyToExisting}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

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
