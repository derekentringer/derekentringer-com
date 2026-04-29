import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { configureCardExpandAnimation } from "@/lib/animations";

// AI-generated summary banner — mirrors web/desktop's expandable
// summary block above the note content. Tapping anywhere on the
// banner expands/collapses; the trash icon (when present) clears
// the summary. The banner is hidden if `summary` is empty/null.

const COLLAPSED_LINES = 1;

export interface SummaryBannerProps {
  summary: string | null | undefined;
  /** Optional clear-summary handler. When omitted (e.g. read-only
   *  detail screen), the trash icon is hidden. The handler is
   *  responsible for confirming with the user before clearing. */
  onDelete?: () => void;
}

export function SummaryBanner({ summary, onDelete }: SummaryBannerProps) {
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotate, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotate]);

  if (!summary || !summary.trim()) return null;

  const chevronRotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <Pressable
      onPress={() => {
        configureCardExpandAnimation();
        setExpanded((v) => !v);
      }}
      style={[
        styles.container,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={expanded ? "Collapse summary" : "Expand summary"}
    >
      <View style={styles.toggleRow}>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <MaterialCommunityIcons
            name="chevron-right"
            size={16}
            color={themeColors.muted}
          />
        </Animated.View>
        <Text
          style={[styles.label, { color: themeColors.muted }]}
        >
          Summary
        </Text>
      </View>
      <Text
        style={[styles.summaryText, { color: themeColors.foreground }]}
        numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        ellipsizeMode="tail"
      >
        {summary}
      </Text>
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Delete summary"
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name="close"
            size={16}
            color={themeColors.muted}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    position: "relative",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
    paddingRight: 24,
  },
  deleteButton: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    padding: 2,
  },
});
