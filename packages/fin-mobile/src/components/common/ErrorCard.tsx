import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, borderRadius, spacing } from "@/theme";

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={styles.button}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Retry: ${message}`}
      >
        <Text style={styles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
  },
  message: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  buttonText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
});
