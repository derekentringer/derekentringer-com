import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NoteSortField, SortOrder } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";

interface SortPickerProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  sortBy: NoteSortField;
  sortOrder: SortOrder;
  onChangeSortBy: (field: NoteSortField) => void;
  onChangeSortOrder: (order: SortOrder) => void;
}

const SORT_FIELDS: { value: NoteSortField; label: string }[] = [
  { value: "updatedAt", label: "Last Modified" },
  { value: "createdAt", label: "Date Created" },
  { value: "title", label: "Title" },
];

export function SortPicker({
  bottomSheetRef,
  sortBy,
  sortOrder,
  onChangeSortBy,
  onChangeSortOrder,
}: SortPickerProps) {
  const themeColors = useThemeColors();

  const handleToggleOrder = useCallback(() => {
    onChangeSortOrder(sortOrder === "asc" ? "desc" : "asc");
  }, [sortOrder, onChangeSortOrder]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["40%"]}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
      backdropComponent={(props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="sort"
            size={20}
            color={themeColors.primary}
          />
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            Sort By
          </Text>
        </View>

        {SORT_FIELDS.map((field) => (
          <Pressable
            key={field.value}
            style={styles.row}
            onPress={() => onChangeSortBy(field.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sortBy === field.value }}
          >
            <MaterialCommunityIcons
              name={
                sortBy === field.value
                  ? "radiobox-marked"
                  : "radiobox-blank"
              }
              size={22}
              color={
                sortBy === field.value
                  ? themeColors.primary
                  : themeColors.muted
              }
            />
            <Text
              style={[styles.fieldLabel, { color: themeColors.foreground }]}
            >
              {field.label}
            </Text>
          </Pressable>
        ))}

        <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

        <Pressable
          style={styles.row}
          onPress={handleToggleOrder}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={sortOrder === "asc" ? "sort-ascending" : "sort-descending"}
            size={22}
            color={themeColors.primary}
          />
          <Text style={[styles.fieldLabel, { color: themeColors.foreground }]}>
            {sortOrder === "asc" ? "Ascending" : "Descending"}
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 15,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.md,
  },
});
