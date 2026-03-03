import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { FinLogo } from "@/components/FinLogo";
import { colors, spacing } from "@/theme";

export function AboutScreen() {
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <View style={styles.container}>
      <FinLogo width={120} height={73} />
      <Text style={styles.appName}>Fin</Text>
      <Text style={styles.version}>Version {version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  appName: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  version: {
    color: colors.mutedForeground,
    fontSize: 14,
  },
});
