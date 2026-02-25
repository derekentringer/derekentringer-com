import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme";

export function DashboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Dashboard</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: colors.foreground,
    fontSize: 18,
  },
});
