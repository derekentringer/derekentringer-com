import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Holding } from "@derekentringer/shared/finance";
import { ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { useQuote } from "@/hooks/useHoldings";
import { Card } from "@/components/common/Card";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface HoldingRowProps {
  holding: Holding;
  onEdit: () => void;
  onDelete: () => void;
}

export function HoldingRow({ holding, onEdit, onDelete }: HoldingRowProps) {
  const shares = holding.shares ?? 0;
  const currentPrice = holding.currentPrice ?? 0;
  const costBasis = holding.costBasis ?? 0;
  const marketValue = shares * currentPrice;
  const gainLoss = marketValue - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

  const quoteQuery = useQuote(holding.ticker ?? "");

  const handleRefreshQuote = useCallback(() => {
    if (holding.ticker) {
      quoteQuery.refetch();
    }
  }, [holding.ticker, quoteQuery]);

  return (
    <SwipeableRow onEdit={onEdit} onDelete={onDelete}>
      <Card>
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.name} numberOfLines={1}>
              {holding.name}
            </Text>
            <View style={styles.badges}>
              {holding.ticker && (
                <View style={styles.tickerBadge}>
                  <Text style={styles.tickerText}>{holding.ticker}</Text>
                </View>
              )}
              <Text style={styles.assetClass}>
                {ASSET_CLASS_LABELS[holding.assetClass]}
              </Text>
            </View>
          </View>
          <View style={styles.right}>
            <Text style={styles.marketValue}>
              {formatCurrencyFull(marketValue)}
            </Text>
            <Text
              style={[
                styles.gainLoss,
                { color: gainLoss >= 0 ? colors.success : colors.error },
              ]}
            >
              {gainLoss >= 0 ? "+" : ""}
              {formatCurrencyFull(gainLoss)} ({gainLossPct >= 0 ? "+" : ""}
              {gainLossPct.toFixed(1)}%)
            </Text>
            <Text style={styles.sharesPrice}>
              {shares.toFixed(4)} × {formatCurrencyFull(currentPrice)}
            </Text>
          </View>
          {holding.ticker && (
            <Pressable
              style={styles.refreshButton}
              onPress={handleRefreshQuote}
              accessibilityRole="button"
              accessibilityLabel="Refresh quote"
            >
              <MaterialCommunityIcons
                name="refresh"
                size={16}
                color={colors.muted}
              />
            </Pressable>
          )}
        </View>
      </Card>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  left: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  tickerBadge: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tickerText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
  },
  assetClass: {
    color: colors.muted,
    fontSize: 10,
  },
  right: {
    alignItems: "flex-end",
  },
  marketValue: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  gainLoss: {
    fontSize: 11,
    fontWeight: "500",
  },
  sharesPrice: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 1,
  },
  refreshButton: {
    marginLeft: spacing.xs,
    padding: spacing.xs,
  },
});
