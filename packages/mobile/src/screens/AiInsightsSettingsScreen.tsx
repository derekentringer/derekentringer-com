import React, { useState, useCallback, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  Switch,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { AiRefreshFrequency, AiInsightStatusEntry } from "@derekentringer/shared/finance";
import { Card } from "@/components/common/Card";
import { useAiPreferences } from "@/hooks/useDashboard";
import { useUpdateAiPreferences, useClearAiCache, useInsightArchive } from "@/hooks/useAiSettings";
import { colors, spacing, borderRadius } from "@/theme";

const FREQUENCY_OPTIONS: Array<{ value: AiRefreshFrequency; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "on_data_change", label: "On Data Change" },
];

const TYPE_ICONS: Record<string, string> = {
  observation: "\uD83D\uDC41",
  recommendation: "\uD83D\uDCA1",
  alert: "\u26A0\uFE0F",
  celebration: "\uD83C\uDF89",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "#60a5fa",
  warning: "#facc15",
  success: "#4ade80",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(insights: AiInsightStatusEntry[]): { date: string; items: AiInsightStatusEntry[] }[] {
  const groups = new Map<string, AiInsightStatusEntry[]>();
  for (const insight of insights) {
    const date = formatDate(insight.generatedAt);
    const existing = groups.get(date);
    if (existing) {
      existing.push(insight);
    } else {
      groups.set(date, [insight]);
    }
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

export function AiInsightsSettingsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAiPreferences();
  const updateMutation = useUpdateAiPreferences();
  const clearCacheMutation = useClearAiCache();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: archiveData,
    isLoading: archiveLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInsightArchive();

  const prefs = data?.preferences;
  const masterEnabled = prefs?.masterEnabled ?? false;

  const archiveInsights = useMemo(
    () => archiveData?.pages.flatMap((p) => p.insights) ?? [],
    [archiveData],
  );

  const archiveGroups = useMemo(
    () => groupByDate(archiveInsights),
    [archiveInsights],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai", "preferences"] }),
      queryClient.invalidateQueries({ queryKey: ["ai", "archive"] }),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const handleToggle = useCallback(
    (key: string, value: boolean) => {
      updateMutation.mutate({ [key]: value });
    },
    [updateMutation],
  );

  const handleFrequency = useCallback(
    (freq: AiRefreshFrequency) => {
      updateMutation.mutate({ refreshFrequency: freq });
    },
    [updateMutation],
  );

  const handleClearCache = useCallback(() => {
    Alert.alert("Clear Cache", "This will clear all cached AI insights.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => clearCacheMutation.mutate(undefined),
      },
    ]);
  }, [clearCacheMutation]);

  const featureToggles = [
    { key: "dashboardCard", label: "Dashboard Card" },
    { key: "monthlyDigest", label: "Monthly Digest" },
    { key: "quarterlyDigest", label: "Quarterly Digest" },
    { key: "pageNudges", label: "Page Nudges" },
    { key: "smartAlerts", label: "Smart Alerts" },
  ] as const;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Master toggle */}
      <Card>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Enable AI Insights</Text>
            <Text style={styles.toggleDescription}>
              AI analyzes your financial data to provide personalized insights.
              Your data stays private and is only used for generating insights.
            </Text>
          </View>
          <Switch
            value={masterEnabled}
            onValueChange={(v) => handleToggle("masterEnabled", v)}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </Card>

      {/* Feature toggles */}
      <Card style={!masterEnabled ? styles.cardDisabled : undefined}>
        <Text style={styles.sectionTitle}>Features</Text>
        {featureToggles.map((toggle, i) => (
          <React.Fragment key={toggle.key}>
            {i > 0 && <View style={styles.separator} />}
            <View style={styles.toggleRow}>
              <Text style={[styles.featureLabel, !masterEnabled && styles.textDisabled]}>
                {toggle.label}
              </Text>
              <Switch
                value={!!(prefs as any)?.[toggle.key]}
                onValueChange={(v) => handleToggle(toggle.key, v)}
                disabled={!masterEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </React.Fragment>
        ))}
      </Card>

      {/* Refresh frequency */}
      <Card style={!masterEnabled ? styles.cardDisabled : undefined}>
        <Text style={styles.sectionTitle}>Refresh Frequency</Text>
        <View style={styles.pillRow}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.pill,
                prefs?.refreshFrequency === opt.value && styles.pillActive,
              ]}
              onPress={() => handleFrequency(opt.value)}
              disabled={!masterEnabled}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.pillText,
                  prefs?.refreshFrequency === opt.value && styles.pillTextActive,
                  !masterEnabled && styles.textDisabled,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {data && (
          <Text style={styles.usageText}>
            {data.dailyRequestsUsed} / {data.dailyRequestsLimit} daily requests used
          </Text>
        )}
      </Card>

      {/* Clear cache */}
      <Pressable
        style={[styles.clearButton, clearCacheMutation.isPending && styles.clearButtonDisabled]}
        onPress={handleClearCache}
        disabled={clearCacheMutation.isPending}
        accessibilityRole="button"
      >
        <Text style={styles.clearButtonText}>
          {clearCacheMutation.isPending ? "Clearing..." : "Clear Insight Cache"}
        </Text>
      </Pressable>

      {/* Insight History */}
      <Card>
        <Text style={styles.sectionTitle}>Insight History</Text>
        {archiveInsights.length === 0 && !archiveLoading ? (
          <Text style={styles.emptyText}>No insight history yet</Text>
        ) : (
          <View style={styles.archiveList}>
            {archiveGroups.map((group) => (
              <View key={group.date}>
                <Text style={styles.dateHeader}>{group.date}</Text>
                {group.items.map((insight) => {
                  const icon = TYPE_ICONS[insight.type] ?? "\uD83D\uDC41";
                  const borderColor = SEVERITY_COLORS[insight.severity] ?? colors.border;
                  const isMuted = insight.isRead || insight.isDismissed;

                  return (
                    <View
                      key={insight.insightId}
                      style={[
                        styles.archiveRow,
                        { borderLeftColor: borderColor },
                        isMuted && styles.archiveRowMuted,
                      ]}
                    >
                      <Text style={styles.archiveIcon}>{icon}</Text>
                      <View style={styles.archiveContent}>
                        <View style={styles.archiveTitleRow}>
                          <Text style={styles.archiveTitle}>{insight.title}</Text>
                          <View style={styles.scopeBadge}>
                            <Text style={styles.scopeText}>{insight.scope}</Text>
                          </View>
                        </View>
                        <Text style={styles.archiveBody}>{insight.body}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
            {hasNextPage && (
              <Pressable
                style={styles.loadMoreButton}
                onPress={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                accessibilityRole="button"
              >
                {isFetchingNextPage ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Load More</Text>
                )}
              </Pressable>
            )}
          </View>
        )}
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  toggleDescription: {
    color: colors.mutedForeground,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  featureLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  textDisabled: {
    color: colors.muted,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  pillTextActive: {
    color: colors.foreground,
  },
  usageText: {
    color: colors.mutedForeground,
    fontSize: 12,
  },
  clearButton: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearButtonText: {
    color: colors.destructive,
    fontSize: 14,
    fontWeight: "500",
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  archiveList: {
    gap: spacing.sm,
  },
  dateHeader: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  archiveRow: {
    flexDirection: "row",
    gap: 8,
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.xs,
  },
  archiveRowMuted: {
    opacity: 0.5,
  },
  archiveIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  archiveContent: {
    flex: 1,
  },
  archiveTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  archiveTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  scopeBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  scopeText: {
    color: colors.muted,
    fontSize: 9,
  },
  archiveBody: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  loadMoreButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "500",
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
