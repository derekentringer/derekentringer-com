import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { colors, spacing } from "@/theme";

interface MonthSelectorProps {
  month: string; // "YYYY-MM"
  onMonthChange: (month: string) => void;
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function navigateMonth(month: string, direction: -1 | 1): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1 + direction, 1);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

export function MonthSelector({ month, onMonthChange }: MonthSelectorProps) {
  const handlePrev = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMonthChange(navigateMonth(month, -1));
  }, [month, onMonthChange]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMonthChange(navigateMonth(month, 1));
  }, [month, onMonthChange]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePrev}
        style={styles.arrow}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
      >
        <MaterialCommunityIcons
          name="chevron-left"
          size={28}
          color={colors.foreground}
        />
      </Pressable>
      <Text style={styles.label}>{formatMonthLabel(month)}</Text>
      <Pressable
        onPress={handleNext}
        style={styles.arrow}
        accessibilityRole="button"
        accessibilityLabel="Next month"
      >
        <MaterialCommunityIcons
          name="chevron-right"
          size={28}
          color={colors.foreground}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  arrow: {
    padding: spacing.xs,
  },
  label: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
