import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Transaction } from "@derekentringer/shared/finance";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";
import { SwipeableRow } from "./SwipeableRow";

interface TransactionRowProps {
  transaction: Transaction;
  onPress: () => void;
  onEdit: () => void;
}

export function TransactionRow({ transaction, onPress, onEdit }: TransactionRowProps) {
  const formattedDate = new Date(transaction.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const isPositive = transaction.amount > 0;

  return (
    <SwipeableRow onEdit={onEdit}>
      <Pressable
        style={styles.container}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${transaction.description}, ${formatCurrencyFull(transaction.amount)}`}
      >
        <View style={styles.left}>
          <Text style={styles.date}>{formattedDate}</Text>
          <Text style={styles.description} numberOfLines={1}>
            {transaction.description}
          </Text>
          {transaction.category ? (
            <Text style={styles.category}>{transaction.category}</Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.amount,
            { color: isPositive ? colors.success : colors.error },
          ]}
        >
          {formatCurrencyFull(transaction.amount)}
        </Text>
      </Pressable>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flex: 1,
    marginRight: spacing.xl + 16,
  },
  date: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  description: {
    color: colors.foreground,
    fontSize: 14,
  },
  category: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  amount: {
    fontSize: 14,
    fontWeight: "600",
  },
});
