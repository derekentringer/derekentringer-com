import React from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, borderRadius } from "@/theme";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search transactions...",
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name="magnify"
        size={20}
        color={colors.muted}
        style={styles.icon}
      />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name="close-circle"
            size={18}
            color={colors.muted}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    padding: 0,
  },
});
