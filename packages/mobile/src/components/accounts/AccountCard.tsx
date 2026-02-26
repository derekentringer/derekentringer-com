import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Account } from "@derekentringer/shared/finance";
import { Card } from "@/components/common/Card";
import { formatCurrency } from "@/lib/chartTheme";
import { colors } from "@/theme";

interface AccountCardProps {
  account: Account;
  onPress: () => void;
}

export function AccountCard({ account, onPress }: AccountCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ opacity: account.isActive ? 1 : 0.5 }}
    >
      <Card>
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.name} numberOfLines={1}>
              {account.name}
            </Text>
            {account.institution ? (
              <Text style={styles.institution} numberOfLines={1}>
                {account.institution}
              </Text>
            ) : null}
          </View>
          <Text style={styles.balance}>
            {formatCurrency(account.currentBalance)}
          </Text>
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
    marginRight: 12,
  },
  name: {
    color: colors.foreground,
    fontSize: 15,
  },
  institution: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  balance: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
});
