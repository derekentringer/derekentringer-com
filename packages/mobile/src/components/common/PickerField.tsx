import React, { useRef, useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, borderRadius } from "@/theme";

interface PickerOption {
  label: string;
  value: string;
}

interface PickerFieldProps {
  label: string;
  value: string;
  options: PickerOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function PickerField({
  label,
  value,
  options,
  onValueChange,
  placeholder,
  error,
}: PickerFieldProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%"], []);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const handleOpen = useCallback(() => {
    sheetRef.current?.snapToIndex(0);
  }, []);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onValueChange(optionValue);
      sheetRef.current?.close();
    },
    [onValueChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: PickerOption }) => (
      <Pressable
        style={styles.optionRow}
        onPress={() => handleSelect(item.value)}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.optionText,
            item.value === value && styles.optionTextSelected,
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    ),
    [value, handleSelect],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.input, error ? styles.inputError : undefined]}
        onPress={handleOpen}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.inputText,
            !selectedLabel && styles.placeholderText,
          ]}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder ?? "Select..."}
        </Text>
        <MaterialCommunityIcons
          name="chevron-down"
          size={20}
          color={colors.muted}
        />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetFlatList
          data={options}
          keyExtractor={(item: PickerOption) => item.value}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.error,
  },
  inputText: {
    color: colors.foreground,
    fontSize: 15,
    flex: 1,
  },
  placeholderText: {
    color: colors.mutedForeground,
  },
  error: {
    color: colors.error,
    fontSize: 12,
    marginTop: 2,
  },
  sheetBg: {
    backgroundColor: colors.card,
  },
  handle: {
    backgroundColor: colors.muted,
    width: 40,
  },
  listContent: {
    padding: spacing.md,
  },
  optionRow: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    color: colors.foreground,
    fontSize: 15,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: "600",
  },
});
