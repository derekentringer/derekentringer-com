import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/theme";

interface DateSectionHeaderProps {
  title: string;
}

export function DateSectionHeader({ title }: DateSectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{title}</Text>
    </View>
  );
}

/**
 * Returns a "Month YYYY" label for a date string.
 * Accepts ISO datetime strings or YYYY-MM-DD date strings.
 */
export function getMonthYearLabel(dateStr: string): string {
  const d = dateStr.length === 10
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Returns a YYYY-MM key for grouping.
 */
export function getMonthYearKey(dateStr: string): string {
  const d = dateStr.length === 10
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Groups items into SectionList-compatible sections by month/year.
 */
export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => string,
): Array<{ title: string; key: string; data: T[] }> {
  const map = new Map<string, { title: string; data: T[] }>();
  for (const item of items) {
    const dateStr = getDate(item);
    const key = getMonthYearKey(dateStr);
    if (!map.has(key)) {
      map.set(key, { title: getMonthYearLabel(dateStr), data: [] });
    }
    map.get(key)!.data.push(item);
  }
  return Array.from(map.entries()).map(([key, val]) => ({
    key,
    title: val.title,
    data: val.data,
  }));
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  text: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
