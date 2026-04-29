import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Animated,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { useClampedRows } from "@/hooks/useClampedRows";
import { cardAnimDuration, cardAnimEasing } from "@/lib/animations";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";

const LOADING_SKELETON_WIDTHS = [72, 96, 84];

const COLLAPSED_LINES = 2;
const ROW_GAP = 6;

interface TagInputProps {
  tags: string[];
  allTags: { name: string; count: number }[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  /** When true a row of shimmer chips renders alongside the
   *  current tags so the user knows tag suggestions are being
   *  generated. */
  isLoading?: boolean;
}

export function TagInput({ tags, allTags, onAddTag, onRemoveTag, isLoading }: TagInputProps) {
  const themeColors = useThemeColors();
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Mirrors the SummaryBanner pattern: chevron + "TAGS" label
  // header sits at the top of the card; the chip wrap below is
  // clamped to 2 rows when collapsed. The chip wrap itself has no
  // padding/border, so chrome = 0 in the hook.
  const {
    expanded,
    setExpanded,
    hasOverflow,
    collapsedHeight,
    naturalHeight,
    handleContainerLayout,
    handleUnitLayout,
  } = useClampedRows({
    itemCount: tags.length,
    maxLines: COLLAPSED_LINES,
    rowGap: ROW_GAP,
    chrome: 0,
  });

  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const lower = inputValue.toLowerCase();
    return allTags
      .filter(
        (t) =>
          t.name.toLowerCase().includes(lower) && !tags.includes(t.name),
      )
      .slice(0, 5);
  }, [inputValue, allTags, tags]);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed && !tags.includes(trimmed)) {
        onAddTag(trimmed);
      }
      setInputValue("");
      setShowSuggestions(false);
    },
    [tags, onAddTag],
  );

  const handleSubmit = useCallback(() => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }, [inputValue, addTag]);

  const handleChangeText = useCallback((text: string) => {
    if (text.endsWith(",")) {
      const tag = text.slice(0, -1).trim();
      if (tag) {
        addTag(tag);
      }
      return;
    }
    setInputValue(text);
    setShowSuggestions(true);
  }, [addTag]);

  const handleKeyPress = useCallback(
    ({ nativeEvent }: { nativeEvent: { key: string } }) => {
      if (nativeEvent.key === "Backspace" && !inputValue && tags.length > 0) {
        onRemoveTag(tags[tags.length - 1]);
      }
    },
    [inputValue, tags, onRemoveTag],
  );

  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rotate, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotate]);
  const chevronRotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  // Per-frame `Animated.Value` driving the chip wrap's
  // `maxHeight`. Initial 9999 means "no cap" so the first onLayout
  // pass measures naturalHeight unconstrained; once both
  // `naturalHeight` and `collapsedHeight` are known the value
  // animates between the two endpoints on toggle.
  const maxH = useRef(new Animated.Value(9999)).current;
  useEffect(() => {
    if (naturalHeight === null || collapsedHeight === null) return;
    // While suggestions are streaming in, force the wrap to its
    // full natural height so the shimmer chips + any newly-added
    // tags aren't hidden behind the 2-row clamp.
    const target = isLoading || !hasOverflow
      ? naturalHeight
      : expanded
        ? naturalHeight
        : collapsedHeight;
    Animated.timing(maxH, {
      toValue: target,
      duration: cardAnimDuration,
      easing: cardAnimEasing,
      useNativeDriver: false,
    }).start();
  }, [expanded, hasOverflow, isLoading, collapsedHeight, naturalHeight, maxH]);

  // When tag suggestions finish (`isLoading` flips false) auto-
  // expand so the user actually sees the newly-merged tags
  // instead of them being silently clipped below the 2-row
  // clamp. They can collapse manually afterwards.
  const prevLoadingRef = useRef(isLoading ?? false);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      setExpanded(true);
    }
    prevLoadingRef.current = isLoading ?? false;
  }, [isLoading, setExpanded]);

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={[
          styles.container,
          { backgroundColor: themeColors.input, borderColor: themeColors.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse tags" : "Expand tags"}
      >
        <View style={styles.headerRow}>
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={themeColors.muted}
            />
          </Animated.View>
          <Text style={[styles.label, { color: themeColors.muted }]}>Tags</Text>
        </View>

        <Animated.View style={{ maxHeight: maxH, overflow: "hidden" }}>
        <View
          style={styles.chipWrap}
          onLayout={handleContainerLayout}
        >
          {tags.map((tag, i) => (
            <View
              key={tag}
              style={[styles.chip, { backgroundColor: `${themeColors.primary}1A` }]}
              onLayout={i === 0 ? handleUnitLayout : undefined}
            >
              <Text style={[styles.chipText, { color: themeColors.primary }]}>
                {tag}
              </Text>
              <Pressable
                onPress={() => onRemoveTag(tag)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove tag ${tag}`}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={16}
                  color={themeColors.primary}
                />
              </Pressable>
            </View>
          ))}
          {isLoading
            ? LOADING_SKELETON_WIDTHS.map((w, i) => (
                <SkeletonLoader
                  key={`tag-skel-${i}`}
                  width={w}
                  height={22}
                  borderRadiusSize={10}
                />
              ))
            : null}
          <TextInput
            style={[styles.input, { color: themeColors.foreground }]}
            placeholder={tags.length === 0 ? "Add tags..." : ""}
            placeholderTextColor={themeColors.muted}
            value={inputValue}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
            onKeyPress={handleKeyPress}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
          />
        </View>
        </Animated.View>
      </Pressable>

      {showSuggestions && suggestions.length > 0 ? (
        <View
          style={[
            styles.suggestions,
            { backgroundColor: themeColors.card, borderColor: themeColors.border },
          ]}
        >
          {suggestions.map((s) => (
            <Pressable
              key={s.name}
              style={styles.suggestionRow}
              onPress={() => addTag(s.name)}
              accessibilityRole="button"
            >
              <Text style={[styles.suggestionText, { color: themeColors.foreground }]}>
                {s.name}
              </Text>
              <Text style={[styles.suggestionCount, { color: themeColors.muted }]}>
                {s.count}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerRow: {
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
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: ROW_GAP,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  input: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    paddingVertical: 2,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginTop: 4,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  suggestionText: {
    fontSize: 14,
  },
  suggestionCount: {
    fontSize: 12,
  },
});
