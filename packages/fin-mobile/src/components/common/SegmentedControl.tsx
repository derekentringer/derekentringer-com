import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius } from "@/theme";

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.container}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          style={[styles.pill, value === opt.value && styles.pillActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(opt.value);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === opt.value }}
        >
          <Text
            style={[
              styles.pillText,
              value === opt.value && styles.pillTextActive,
            ]}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    gap: 4,
    padding: 4,
  },
  pill: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    backgroundColor: "transparent",
  },
  pillActive: {
    backgroundColor: colors.border,
  },
  pillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  pillTextActive: {
    color: colors.foreground,
  },
});
