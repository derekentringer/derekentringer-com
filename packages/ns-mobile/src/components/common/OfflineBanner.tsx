import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import useSyncStore from "@/store/syncStore";
import { useThemeColors } from "@/theme/colors";

export function OfflineBanner() {
  const isOnline = useSyncStore((s) => s.isOnline);
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4, backgroundColor: themeColors.card, borderBottomColor: themeColors.border, zIndex: 1, elevation: 5 }]}>
      <MaterialCommunityIcons name="cloud-off-outline" size={14} color={themeColors.muted} />
      <Text style={[styles.text, { color: themeColors.muted }]}>
        No internet — changes saved locally
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
    gap: 6,
    borderBottomWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
  },
});
