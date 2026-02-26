import React from "react";
import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import { colors, borderRadius, spacing } from "@/theme";

const TIME_RANGES: { value: ChartTimeRange; label: string }[] = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "12m", label: "1Y" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

const GRANULARITIES: { value: ChartGranularity; label: string }[] = [
  { value: "daily", label: "D" },
  { value: "weekly", label: "W" },
  { value: "monthly", label: "M" },
];

interface TimeRangeSelectorProps {
  range: ChartTimeRange;
  granularity: ChartGranularity;
  onRangeChange: (range: ChartTimeRange) => void;
  onGranularityChange: (granularity: ChartGranularity) => void;
  showGranularity?: boolean;
}

export function TimeRangeSelector({
  range,
  granularity,
  onRangeChange,
  onGranularityChange,
  showGranularity = true,
}: TimeRangeSelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TIME_RANGES.map((r) => (
        <Pressable
          key={r.value}
          style={[styles.pill, range === r.value && styles.pillActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onRangeChange(r.value);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Time range: ${r.label}`}
          accessibilityState={{ selected: range === r.value }}
        >
          <Text style={[styles.pillText, range === r.value && styles.pillTextActive]}>
            {r.label}
          </Text>
        </Pressable>
      ))}
      {showGranularity && (
        <>
          <Text style={styles.separator}>|</Text>
          {GRANULARITIES.map((g) => (
            <Pressable
              key={g.value}
              style={[styles.pill, granularity === g.value && styles.pillActive]}
              onPress={() => {
                Haptics.selectionAsync();
                onGranularityChange(g.value);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Granularity: ${g.label}`}
              accessibilityState={{ selected: granularity === g.value }}
            >
              <Text style={[styles.pillText, granularity === g.value && styles.pillTextActive]}>
                {g.label}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pill: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: borderRadius.md,
    backgroundColor: "transparent",
  },
  pillActive: {
    backgroundColor: colors.border,
  },
  pillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  pillTextActive: {
    color: colors.foreground,
  },
  separator: {
    color: colors.border,
    fontSize: 14,
    marginHorizontal: 2,
  },
});
