import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius } from "@/theme";

type TimePeriod = 6 | 12 | 24;

const PERIODS: Array<{ value: TimePeriod; label: string }> = [
  { value: 6, label: "6M" },
  { value: 12, label: "12M" },
  { value: 24, label: "24M" },
];

interface TimePeriodSelectorProps {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
}

export function TimePeriodSelector({ value, onChange }: TimePeriodSelectorProps) {
  return (
    <View style={styles.container}>
      {PERIODS.map((p) => (
        <Pressable
          key={p.value}
          style={[styles.pill, value === p.value && styles.pillActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(p.value);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Time period: ${p.label}`}
          accessibilityState={{ selected: value === p.value }}
        >
          <Text style={[styles.pillText, value === p.value && styles.pillTextActive]}>
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export type { TimePeriod };

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pill: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
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
