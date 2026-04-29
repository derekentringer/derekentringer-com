import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  type LayoutChangeEvent,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { cardAnimDuration, cardAnimEasing } from "@/lib/animations";

// AI-generated summary banner — mirrors web/desktop's expandable
// summary block above the note content. Tapping anywhere on the
// banner expands/collapses; the close (×) icon clears the
// summary. The banner is hidden if `summary` is empty/null.
//
// Animation strategy: per-frame `Animated.Value` driving the
// wrapping View's `maxHeight`. Because the value is JS-driven
// and updated every frame, RN reflows the parent on each tick
// — so siblings below the card slide smoothly with it instead
// of jumping to the post-toggle layout. Mirrors the
// `transition-[max-height] duration-300 ease-in-out` pattern
// from ns-web/ns-desktop sidebars.

const COLLAPSED_TEXT_HEIGHT = 18; // ~1 line at fontSize 13, lineHeight 18

export interface SummaryBannerProps {
  summary: string | null | undefined;
  /** Optional clear-summary handler. When omitted (e.g. read-only
   *  detail screen), the close icon is hidden. The handler is
   *  responsible for confirming with the user before clearing. */
  onDelete?: () => void;
}

export function SummaryBanner({ summary, onDelete }: SummaryBannerProps) {
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  const rotate = useRef(new Animated.Value(0)).current;
  const maxHeight = useRef(new Animated.Value(COLLAPSED_TEXT_HEIGHT)).current;

  useEffect(() => {
    Animated.timing(rotate, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotate]);

  useEffect(() => {
    if (naturalHeight === null) return;
    Animated.timing(maxHeight, {
      toValue: expanded ? naturalHeight : COLLAPSED_TEXT_HEIGHT,
      duration: cardAnimDuration,
      easing: cardAnimEasing,
      useNativeDriver: false,
    }).start();
  }, [expanded, naturalHeight, maxHeight]);

  const handleTextLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (naturalHeight === null) {
      setNaturalHeight(h);
      maxHeight.setValue(expanded ? h : COLLAPSED_TEXT_HEIGHT);
    } else if (Math.abs(h - naturalHeight) > 2 && expanded) {
      // Summary text changed while expanded — re-measure.
      setNaturalHeight(h);
      maxHeight.setValue(h);
    }
  };

  if (!summary || !summary.trim()) return null;

  const chevronRotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
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
      <Animated.View style={{ maxHeight, overflow: "hidden" }}>
        <Text
          style={[styles.summaryText, { color: themeColors.foreground }]}
          onLayout={handleTextLayout}
        >
          {summary}
        </Text>
      </Animated.View>
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
