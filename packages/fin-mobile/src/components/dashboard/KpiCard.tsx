import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { colors, borderRadius, spacing } from "@/theme";

interface SparklineData {
  data: number[];
  change: number;
  label: string;
  color: string;
  invertColor?: boolean;
}

interface TrendData {
  direction: "up" | "down" | "neutral";
  value: string;
  invertColor?: boolean;
}

interface KpiCardProps {
  title: string;
  value: string;
  sparkline?: SparklineData;
  trend?: TrendData;
}

const SPARK_WIDTH = 56;
const SPARK_HEIGHT = 24;

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_WIDTH;
      const y = SPARK_HEIGHT - ((v - min) / range) * SPARK_HEIGHT;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Svg width={SPARK_WIDTH} height={SPARK_HEIGHT}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function KpiCard({ title, value, sparkline, trend }: KpiCardProps) {
  const sparkIsPositive = sparkline
    ? sparkline.invertColor ? sparkline.change < 0 : sparkline.change > 0
    : false;
  const sparkIsNegative = sparkline
    ? sparkline.invertColor ? sparkline.change > 0 : sparkline.change < 0
    : false;

  const sparkArrow = sparkline
    ? sparkline.change > 0 ? "\u2197" : sparkline.change < 0 ? "\u2198" : "\u2192"
    : "";

  const trendIsPositive = trend?.invertColor
    ? trend.direction === "down"
    : trend?.direction === "up";
  const trendIsNegative = trend?.invertColor
    ? trend.direction === "up"
    : trend?.direction === "down";

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`${title}: ${value}${
        sparkline ? `, ${sparkline.change > 0 ? "+" : ""}${sparkline.change.toFixed(1)}% ${sparkline.label}` : ""
      }${trend ? `, ${trend.value}` : ""}`}
    >
      <Text style={styles.title}>{title}</Text>
      {sparkline && sparkline.data.length >= 2 ? (
        <View style={styles.contentRow}>
          <Text style={styles.valueWithSpark} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
          <View style={styles.divider} />
          <View style={styles.sparkColumn}>
            <MiniSparkline data={sparkline.data} color={sparkline.color} />
            <Text
              style={[
                styles.changeText,
                sparkIsPositive && styles.changePositive,
                sparkIsNegative && styles.changeNegative,
              ]}
              numberOfLines={1}
            >
              {sparkArrow} {sparkline.change > 0 ? "+" : ""}{sparkline.change.toFixed(1)}%
              <Text style={styles.changeLabel}> {sparkline.label}</Text>
            </Text>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
          {trend && (
            <View style={styles.trendRow}>
              <View
                style={[
                  styles.trendBadge,
                  trendIsPositive && styles.trendBadgePositive,
                  trendIsNegative && styles.trendBadgeNegative,
                ]}
              >
                <Text
                  style={[
                    styles.trendText,
                    trendIsPositive && styles.trendTextPositive,
                    trendIsNegative && styles.trendTextNegative,
                  ]}
                >
                  {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192"} {trend.value}
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    height: 110,
    justifyContent: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: 11,
    marginBottom: 4,
  },
  value: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  valueWithSpark: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
    flexShrink: 1,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  sparkColumn: {
    alignItems: "flex-start",
    gap: 3,
  },
  changeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "500",
  },
  changePositive: {
    color: colors.success,
  },
  changeNegative: {
    color: colors.error,
  },
  changeLabel: {
    color: colors.muted,
    fontWeight: "400",
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  trendBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  trendBadgePositive: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  trendBadgeNegative: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  trendText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "500",
  },
  trendTextPositive: {
    color: colors.success,
  },
  trendTextNegative: {
    color: colors.error,
  },
});
