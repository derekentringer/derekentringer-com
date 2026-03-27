import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

interface TagInputProps {
  tags: string[];
  allTags: { name: string; count: number }[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

export function TagInput({ tags, allTags, onAddTag, onRemoveTag }: TagInputProps) {
  const themeColors = useThemeColors();
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  return (
    <View>
      <View
        style={[
          styles.container,
          { backgroundColor: themeColors.input, borderColor: themeColors.border },
        ]}
      >
        {tags.map((tag) => (
          <View
            key={tag}
            style={[styles.chip, { backgroundColor: `${themeColors.primary}1A` }]}
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
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 6,
    minHeight: 40,
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
