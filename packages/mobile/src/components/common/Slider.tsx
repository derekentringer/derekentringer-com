import React, { useCallback } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, borderRadius } from "@/theme";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  formatValue,
}: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : String(value);

  const handleDecrement = useCallback(() => {
    const next = Math.max(min, value - step);
    if (next !== value) {
      Haptics.selectionAsync();
      onValueChange(next);
    }
  }, [value, min, step, onValueChange]);

  const handleIncrement = useCallback(() => {
    const next = Math.min(max, value + step);
    if (next !== value) {
      Haptics.selectionAsync();
      onValueChange(next);
    }
  }, [value, max, step, onValueChange]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, value <= min && styles.buttonDisabled]}
          onPress={handleDecrement}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <MaterialCommunityIcons
            name="minus"
            size={20}
            color={value <= min ? colors.mutedForeground : colors.foreground}
          />
        </Pressable>
        <View style={styles.valueContainer}>
          <Text style={styles.valueText}>{displayValue}</Text>
        </View>
        <Pressable
          style={[styles.button, value >= max && styles.buttonDisabled]}
          onPress={handleIncrement}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <MaterialCommunityIcons
            name="plus"
            size={20}
            color={value >= max ? colors.mutedForeground : colors.foreground}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  valueContainer: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  valueText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
});
