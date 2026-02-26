import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from "@/components/common/Card";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { useAiPreferences, useAiInsights } from "@/hooks/useDashboard";
import type { AiInsight } from "@derekentringer/shared/finance";
import { colors, spacing, borderRadius } from "@/theme";

const SEEN_KEY = "ai-insights-seen-ids";

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

async function getSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

async function markSeen(ids: string[]) {
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // non-critical
  }
}

export function AiInsightCard() {
  const { data: prefData, isLoading: prefLoading } = useAiPreferences();
  const enabled = prefData?.preferences?.masterEnabled && prefData?.preferences?.dashboardCard;
  const { data: insightData, isLoading: insightLoading } = useAiInsights("dashboard", !!enabled);

  const insights = insightData?.insights ?? [];
  const isLoading = prefLoading || (enabled && insightLoading);

  const [collapsed, setCollapsed] = useState(true);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSeenIds().then(setSeenIds);
  }, []);

  const unseenCount = useMemo(
    () => insights.filter((i) => !seenIds.has(i.id)).length,
    [insights, seenIds],
  );

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const willExpand = prev;
      if (willExpand && insights.length > 0) {
        const allIds = insights.map((i) => i.id);
        markSeen(allIds);
        setSeenIds(new Set(allIds));
      }
      return !prev;
    });
  }, [insights]);

  if (!enabled && !isLoading) return null;
  if (isLoading) return <SkeletonCard lines={2} />;
  if (insights.length === 0) return null;

  return (
    <Card>
      <Pressable
        onPress={handleToggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`AI Insights, ${insights.length} insights${unseenCount > 0 ? `, ${unseenCount} new` : ""}`}
      >
        <Text style={styles.headerIcon}>🧠</Text>
        <Text style={styles.headerTitle}>AI Insights</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{insights.length}</Text>
        </View>
        {unseenCount > 0 && collapsed && <View style={styles.unseenDot} />}
        <Text style={[styles.chevron, !collapsed && styles.chevronOpen]}>▸</Text>
      </Pressable>
      {!collapsed && (
        <View style={styles.insightList}>
          {insights.map((insight) => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
        </View>
      )}
    </Card>
  );
}

function InsightRow({ insight }: { insight: AiInsight }) {
  const icon = TYPE_ICONS[insight.type] ?? "\uD83D\uDC41";
  const borderColor = SEVERITY_COLORS[insight.severity] ?? colors.border;

  return (
    <View
      style={[styles.insightRow, { borderLeftColor: borderColor }]}
      accessibilityLabel={`${insight.type}: ${insight.title}. ${insight.body}`}
    >
      <Text style={styles.insightIcon}>{icon}</Text>
      <View style={styles.insightContent}>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        <Text style={styles.insightBody}>{insight.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    fontSize: 16,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  countBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    color: colors.muted,
    fontSize: 10,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  chevron: {
    color: colors.muted,
    fontSize: 14,
    marginLeft: "auto",
    transform: [{ rotate: "90deg" }],
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  insightList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  insightRow: {
    flexDirection: "row",
    gap: 8,
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 4,
  },
  insightIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  insightBody: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
