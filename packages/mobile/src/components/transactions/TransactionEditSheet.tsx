import React, { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import type { Transaction } from "@derekentringer/shared/finance";
import { useCategories } from "@/hooks/useTransactions";
import { PickerField } from "@/components/common/PickerField";
import { FormField } from "@/components/common/FormField";
import { colors, spacing, borderRadius } from "@/theme";

interface TransactionEditSheetProps {
  transaction: Transaction;
  onClose: () => void;
  onSave: (data: { category?: string | null; notes?: string | null }) => Promise<void>;
}

export function TransactionEditSheet({
  transaction,
  onClose,
  onSave,
}: TransactionEditSheetProps) {
  const snapPoints = useMemo(() => ["60%"], []);
  const categoriesQuery = useCategories();

  const [category, setCategory] = useState(transaction.category ?? "");
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [saving, setSaving] = useState(false);

  const categoryOptions = useMemo(() => {
    const options = [{ label: "None", value: "" }];
    if (categoriesQuery.data?.categories) {
      for (const cat of categoriesQuery.data.categories) {
        options.push({ label: cat.name, value: cat.name });
      }
    }
    return options;
  }, [categoriesQuery.data]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({
        category: category || null,
        notes: notes || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [category, notes, onSave, onClose]);

  return (
    <BottomSheet
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>Edit Transaction</Text>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description}
        </Text>

        <View style={styles.fields}>
          <PickerField
            label="Category"
            value={category}
            options={categoryOptions}
            onValueChange={setCategory}
            placeholder="Select category"
          />

          <FormField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes..."
            multiline
            numberOfLines={3}
          />
        </View>

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
  },
  description: {
    color: colors.muted,
    fontSize: 13,
  },
  fields: {
    gap: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
