import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeColors } from "@/theme/colors";
import { borderRadius, spacing } from "@/theme";

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  const themeColors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
    >
      <Text style={[styles.message, { color: themeColors.error }]}>{message}</Text>
      <Pressable
        style={[styles.button, { backgroundColor: themeColors.border }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Retry: ${message}`}
      >
        <Text style={[styles.buttonText, { color: themeColors.foreground }]}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: "center",
  },
  message: {
    fontSize: 13,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  button: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
