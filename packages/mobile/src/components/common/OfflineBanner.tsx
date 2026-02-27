import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const insets = useSafeAreaInsets();

  if (isConnected !== false) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}>
      <MaterialCommunityIcons
        name="wifi-off"
        size={16}
        color={colors.foreground}
      />
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.destructive,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  text: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
});
