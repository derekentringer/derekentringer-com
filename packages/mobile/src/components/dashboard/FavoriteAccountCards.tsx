import React, { useState } from "react";
import { View, Text, FlatList, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { Card } from "@/components/common/Card";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { useAccountBalanceHistory } from "@/hooks/useDashboard";
import { getCategoryColor, formatCurrency } from "@/lib/chartTheme";
import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import { colors, spacing, borderRadius } from "@/theme";

const CARD_WIDTH = Dimensions.get("window").width * 0.75;

interface FavoriteAccountCardProps {
  accountId: string;
  colorIndex: number;
}

function FavoriteAccountCard({ accountId, colorIndex }: FavoriteAccountCardProps) {
  const [range] = useState<ChartTimeRange>("12m");
  const [granularity] = useState<ChartGranularity>("weekly");
  const color = getCategoryColor(colorIndex);

  const { data, isLoading, error, refetch } = useAccountBalanceHistory(accountId, range, granularity);

  if (isLoading) return <SkeletonCard style={{ width: CARD_WIDTH }} />;
  if (error) return <View style={{ width: CARD_WIDTH }}><ErrorCard message="Failed to load" onRetry={() => refetch()} /></View>;
  if (!data) return null;

  const chartData = data.history.map((p) => ({ value: p.balance }));

  // Compute trend
  let trendText = "";
  let trendColor: string = colors.muted;
  if (data.history.length >= 2) {
    const current = data.history[data.history.length - 1].balance;
    const previous = data.history[data.history.length - 2].balance;
    if (previous !== 0) {
      const pct = ((current - previous) / Math.abs(previous)) * 100;
      const arrow = pct >= 0 ? "\u2191" : "\u2193";
      trendText = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
      trendColor = pct >= 0 ? colors.success : colors.error;
    }
  }

  return (
    <View style={[styles.accountCard, { width: CARD_WIDTH }]}>
      <Card>
        <View style={styles.accountHeader}>
          <Text style={styles.accountName} numberOfLines={1}>{data.accountName}</Text>
          {trendText ? (
            <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
          ) : null}
        </View>
        <Text style={styles.balanceText}>{formatCurrency(data.currentBalance)}</Text>
        {chartData.length >= 2 && (
          <View style={styles.miniChart} accessibilityLabel={`${data.accountName} balance trend`}>
            <LineChart
              data={chartData}
              width={CARD_WIDTH - 60}
              height={60}
              hideDataPoints
              hideYAxisText
              hideAxesAndRules
              color={color}
              curved
              thickness={1.5}
              areaChart
              startFillColor={color}
              startOpacity={0.15}
              endOpacity={0}
              disableScroll
              adjustToWidth
              isAnimated={false}
            />
          </View>
        )}
      </Card>
    </View>
  );
}

interface FavoriteAccountCardsProps {
  accountIds: string[];
}

export function FavoriteAccountCards({ accountIds }: FavoriteAccountCardsProps) {
  if (accountIds.length === 0) return null;

  return (
    <View>
      <Text style={styles.sectionTitle}>Favorite Accounts</Text>
      <FlatList
        data={accountIds}
        keyExtractor={(id) => id}
        renderItem={({ item, index }) => (
          <FavoriteAccountCard accountId={item} colorIndex={index} />
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + spacing.sm}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingRight: spacing.md,
  },
  accountCard: {
    // width set dynamically
  },
  accountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  accountName: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  trendText: {
    fontSize: 11,
    fontWeight: "500",
  },
  balanceText: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  miniChart: {
    marginLeft: -16,
    marginBottom: -16,
  },
});
