import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MobileHeading } from "@/lib/extractHeadings";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";

interface TocSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  headings: MobileHeading[];
  /** Tapping a heading dismisses the sheet and asks the host
   *  screen to scroll to that heading. The host looks up the Y
   *  position by `text` (kept by markdownRules' heading capture). */
  onSelectHeading: (heading: MobileHeading) => void;
}

export function TocSheet({
  bottomSheetRef,
  headings,
  onSelectHeading,
}: TocSheetProps) {
  const themeColors = useThemeColors();

  const minLevel = headings.length
    ? Math.min(...headings.map((h) => h.level))
    : 1;

  const handlePress = useCallback(
    (heading: MobileHeading) => {
      bottomSheetRef.current?.dismiss();
      onSelectHeading(heading);
    },
    [bottomSheetRef, onSelectHeading],
  );

  const renderItem = useCallback(
    ({ item }: { item: MobileHeading }) => (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { paddingLeft: spacing.md + (item.level - minLevel) * 16 },
          pressed && { backgroundColor: themeColors.card },
        ]}
        onPress={() => handlePress(item)}
        accessibilityRole="link"
        accessibilityLabel={`Jump to ${item.text}`}
      >
        <Text
          style={[
            styles.rowText,
            {
              color: themeColors.foreground,
              fontWeight: item.level === minLevel ? "600" : "400",
            },
          ]}
          numberOfLines={1}
        >
          {item.text}
        </Text>
      </Pressable>
    ),
    [minLevel, handlePress, themeColors],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["60%", "90%"]}
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
      {headings.length === 0 ? (
        <BottomSheetView style={styles.emptyContent}>
          <View style={styles.header}>
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={20}
              color={themeColors.primary}
            />
            <Text style={[styles.title, { color: themeColors.foreground }]}>
              Table of Contents
            </Text>
          </View>
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            No headings in this note
          </Text>
        </BottomSheetView>
      ) : (
        <BottomSheetFlatList
          data={headings}
          // text+level pair is unique enough as a key for typical
          // notes; for duplicate-text headings the consequence is
          // a stable RN list key collision warning, not incorrect
          // behavior — the renderer's Y map keys by text too, so
          // the duplicates collapse there as well.
          keyExtractor={(item: MobileHeading, idx: number) =>
            `${item.level}:${item.text}:${idx}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <MaterialCommunityIcons
                name="format-list-bulleted"
                size={20}
                color={themeColors.primary}
              />
              <Text style={[styles.title, { color: themeColors.foreground }]}>
                Table of Contents
              </Text>
            </View>
          }
        />
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  emptyContent: {
    flex: 1,
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
  list: {
    paddingBottom: spacing.lg,
  },
  row: {
    paddingRight: spacing.md,
    paddingVertical: 10,
  },
  rowText: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
