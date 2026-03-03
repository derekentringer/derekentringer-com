import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card } from "@/components/common/Card";
import { formatCurrency } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

interface AccountGroupHeaderProps {
  label: string;
  count: number;
  totalBalance: number;
  onPress: () => void;
}

export function AccountGroupHeader({
  label,
  count,
  totalBalance,
  onPress,
}: AccountGroupHeaderProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.count}>
              {count} {count === 1 ? "account" : "accounts"}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.balance}>{formatCurrency(totalBalance)}</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.muted}
            />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: {
    flex: 1,
  },
  label: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  count: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  balance: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
