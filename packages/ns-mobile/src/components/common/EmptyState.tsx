import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.message, { color: themeColors.muted }]}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable
          style={[styles.button, { backgroundColor: themeColors.primary }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.buttonText, { color: themeColors.background }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  button: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
