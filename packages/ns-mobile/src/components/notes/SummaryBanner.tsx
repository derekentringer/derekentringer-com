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
import { SkeletonLoader } from "@/components/common/SkeletonLoader";

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
  /** When true a shimmer placeholder renders in place of the
   *  summary text. The banner stays mounted even with no summary
   *  yet so the loading state is visible while the AI runs. */
  isLoading?: boolean;
}

export function SummaryBanner({ summary, onDelete, isLoading }: SummaryBannerProps) {
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  const rotate = useRef(new Animated.Value(0)).current;
  // Wrapper uses explicit `height` (not maxHeight) because the
  // inner Text is absolutely positioned so it can measure
  // naturally regardless of the wrapper's clamp. Without `height`,
  // an absolutely-positioned child wouldn't contribute to the
  // wrapper's content height, so the wrapper would collapse to 0.
  const animHeight = useRef(new Animated.Value(COLLAPSED_TEXT_HEIGHT)).current;

  useEffect(() => {
    Animated.timing(rotate, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotate]);

  useEffect(() => {
    if (naturalHeight === null) return;
    Animated.timing(animHeight, {
      toValue: expanded ? naturalHeight : COLLAPSED_TEXT_HEIGHT,
      duration: cardAnimDuration,
      easing: cardAnimEasing,
      useNativeDriver: false,
    }).start();
  }, [expanded, naturalHeight, animHeight]);

  const handleTextLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (naturalHeight === null || Math.abs(h - naturalHeight) > 2) {
      setNaturalHeight(h);
    }
  };

  if (!isLoading && (!summary || !summary.trim())) return null;

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
      {isLoading ? (
        <View style={styles.loadingRow}>
          <SkeletonLoader height={14} width="92%" />
        </View>
      ) : (
        <Animated.View style={[styles.textClamp, { height: animHeight }]}>
          <Text
            style={[
              styles.summaryText,
              styles.summaryTextAbs,
              { color: themeColors.foreground },
            ]}
            onLayout={handleTextLayout}
          >
            {summary}
          </Text>
        </Animated.View>
      )}
      {onDelete && !isLoading ? (
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
  textClamp: {
    overflow: "hidden",
    position: "relative",
  },
  loadingRow: {
    paddingVertical: 2,
    paddingRight: 24,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
    paddingRight: 24,
  },
  summaryTextAbs: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  deleteButton: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    padding: 2,
  },
});
