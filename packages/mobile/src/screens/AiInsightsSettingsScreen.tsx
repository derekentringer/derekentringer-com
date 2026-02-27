import React, { useState, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  Switch,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { AiRefreshFrequency } from "@derekentringer/shared/finance";
import { Card } from "@/components/common/Card";
import { useAiPreferences } from "@/hooks/useDashboard";
import { useUpdateAiPreferences, useClearAiCache } from "@/hooks/useAiSettings";
import { colors, spacing, borderRadius } from "@/theme";

const FREQUENCY_OPTIONS: Array<{ value: AiRefreshFrequency; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "on_data_change", label: "On Data Change" },
];

export function AiInsightsSettingsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAiPreferences();
  const updateMutation = useUpdateAiPreferences();
  const clearCacheMutation = useClearAiCache();
  const [refreshing, setRefreshing] = useState(false);

  const prefs = data?.preferences;
  const masterEnabled = prefs?.masterEnabled ?? false;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["ai", "preferences"] });
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
  bottomSpacer: {
    height: spacing.xl,
  },
});
