import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";

export function NotesScreen() {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Text style={[styles.text, { color: themeColors.foreground }]}>Notes</Text>
      <Text style={[styles.subtitle, { color: themeColors.muted }]}>
        Coming soon
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  text: {
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 14,
    marginTop: spacing.sm,
  },
});
