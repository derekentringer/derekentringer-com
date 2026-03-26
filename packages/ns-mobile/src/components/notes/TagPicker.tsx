import React, { useCallback } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { TagInfo } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";

interface TagPickerProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  tags: TagInfo[];
  selectedTags: string[];
  onToggleTag: (tagName: string) => void;
  onClear: () => void;
}

export function TagPicker({
  bottomSheetRef,
  tags,
  selectedTags,
  onToggleTag,
  onClear,
}: TagPickerProps) {
  const themeColors = useThemeColors();

  const renderItem = useCallback(
    ({ item }: { item: TagInfo }) => {
      const isSelected = selectedTags.includes(item.name);

      return (
        <Pressable
          style={styles.row}
          onPress={() => onToggleTag(item.name)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected }}
        >
          <MaterialCommunityIcons
            name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
            size={22}
            color={isSelected ? themeColors.primary : themeColors.muted}
          />
          <Text
            style={[styles.tagName, { color: themeColors.foreground }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[styles.count, { color: themeColors.muted }]}>
            {item.count}
          </Text>
        </Pressable>
      );
    },
    [selectedTags, themeColors, onToggleTag],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["50%", "80%"]}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            Tags
          </Text>
          {selectedTags.length > 0 ? (
            <Pressable onPress={onClear} accessibilityRole="button">
              <Text style={[styles.clearText, { color: themeColors.primary }]}>
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>
        <FlatList
          data={tags}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  clearText: {
    fontSize: 14,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  tagName: {
    fontSize: 15,
    flex: 1,
  },
  count: {
    fontSize: 12,
  },
});
