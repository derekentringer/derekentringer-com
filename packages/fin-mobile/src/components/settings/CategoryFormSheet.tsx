import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { Category } from "@derekentringer/shared/finance";
import { FormField } from "@/components/common/FormField";
import { colors, spacing, borderRadius } from "@/theme";

interface CategoryFormSheetProps {
  category?: Category | null;
  onClose: () => void;
  onSubmit: (data: { name: string }) => Promise<void>;
}

export function CategoryFormSheet({ category, onClose, onSubmit }: CategoryFormSheetProps) {
  const isEdit = !!category;
  const snapPoints = useMemo(() => ["50%"], []);

  const [name, setName] = useState(category?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim() });
    } finally {
      setSubmitting(false);
    }
  }, [name, submitting, onSubmit]);

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
          {isEdit ? "Edit Category" : "Add Category"}
        </Text>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Category name"
          autoFocus={!isEdit}
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
              (!name.trim() || submitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || submitting}
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
