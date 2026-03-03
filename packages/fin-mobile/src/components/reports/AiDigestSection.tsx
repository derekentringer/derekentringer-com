import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { AiInsightScope, AiInsight, AiInsightSeverity, AiInsightType } from "@derekentringer/shared/finance";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { useAiPreferences } from "@/hooks/useDashboard";
import { useAiDigest } from "@/hooks/useReports";
import type { MoreStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

function getLastCompletedMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getLastCompletedQuarter(): string {
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3) + 1;
  let year = now.getFullYear();
  let quarter = currentQ - 1;
  if (quarter === 0) {
    quarter = 4;
    year--;
  }
  return `${year}-Q${quarter}`;
}

function navigateMonth(current: string, direction: number): string {
  const [y, m] = current.split("-").map(Number);
  const d = new Date(y, m - 1 + direction, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function navigateQuarter(current: string, direction: number): string {
  const [yearStr, qStr] = current.split("-Q");
  let year = parseInt(yearStr);
  let q = parseInt(qStr) + direction;
  while (q < 1) { q += 4; year--; }
  while (q > 4) { q -= 4; year++; }
  return `${year}-Q${q}`;
}

function formatMonthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatQuarterLabel(period: string): string {
  const [y, q] = period.split("-Q");
  return `Q${q} ${y}`;
}

const SEVERITY_COLORS: Record<AiInsightSeverity, string> = {
  info: colors.primary,
  warning: "#f59e0b",
  success: colors.success,
};

const TYPE_ICONS: Record<AiInsightType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  observation: "eye-outline",
  recommendation: "lightbulb-outline",
  alert: "alert-outline",
  celebration: "party-popper",
};

interface AiDigestSectionProps {
  scope: AiInsightScope;
}

export function AiDigestSection({ scope }: AiDigestSectionProps) {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const isMonthly = scope === "monthly-digest";

  const [period, setPeriod] = useState(
    isMonthly ? getLastCompletedMonth() : getLastCompletedQuarter(),
  );

  const { data: prefsData } = useAiPreferences();
  const prefs = prefsData?.preferences;
  const featureEnabled = prefs?.masterEnabled && (isMonthly ? prefs?.monthlyDigest : prefs?.quarterlyDigest);

  const options = useMemo(
    () => (isMonthly ? { month: period } : { quarter: period }),
    [isMonthly, period],
  );

  const { data, isLoading, error, refetch } = useAiDigest(scope, options, !!featureEnabled);

  const handlePrev = useCallback(() => {
    setPeriod((p) => (isMonthly ? navigateMonth(p, -1) : navigateQuarter(p, -1)));
  }, [isMonthly]);

  const handleNext = useCallback(() => {
    const max = isMonthly ? getLastCompletedMonth() : getLastCompletedQuarter();
    setPeriod((p) => {
      const next = isMonthly ? navigateMonth(p, 1) : navigateQuarter(p, 1);
      return next > max ? p : next;
    });
  }, [isMonthly]);

  const maxPeriod = isMonthly ? getLastCompletedMonth() : getLastCompletedQuarter();
  const isAtMax = period >= maxPeriod;

  if (!featureEnabled) {
    return (
      <EmptyState
        message={`${isMonthly ? "Monthly" : "Quarterly"} digest is disabled. Enable it in AI Insights settings.`}
        actionLabel="Go to Settings"
        onAction={() => navigation.navigate("AiInsightsSettings")}
      />
    );
  }

  if (isLoading && !data) return <SkeletonChartCard height={200} />;
  if (error && !data) return <ErrorCard message="Failed to load digest" onRetry={() => refetch()} />;

  const insights = data?.insights ?? [];

  return (
    <View style={styles.container}>
      {/* Period navigation */}
      <View style={styles.periodNav}>
        <Pressable onPress={handlePrev} accessibilityRole="button" accessibilityLabel="Previous period">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.foreground} />
        </Pressable>
        <Text style={styles.periodLabel}>
          {isMonthly ? formatMonthLabel(period) : formatQuarterLabel(period)}
        </Text>
        <Pressable
          onPress={handleNext}
          disabled={isAtMax}
          accessibilityRole="button"
          accessibilityLabel="Next period"
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={28}
            color={isAtMax ? colors.muted : colors.foreground}
          />
        </Pressable>
      </View>

      {/* Insight cards */}
      {insights.length === 0 ? (
        <EmptyState message="No insights for this period" />
      ) : (
        insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))
      )}

      {/* Disclaimer */}
      <Text style={styles.disclaimer}>
        AI-generated insights — not professional financial advice
      </Text>
    </View>
  );
}

function InsightCard({ insight }: { insight: AiInsight }) {
  const borderColor = SEVERITY_COLORS[insight.severity];
  const iconName = TYPE_ICONS[insight.type];

  return (
    <Card style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}>
      <View style={styles.insightHeader}>
        <MaterialCommunityIcons name={iconName} size={18} color={borderColor} />
        <Text style={styles.insightTitle}>{insight.title}</Text>
      </View>
      <Text style={styles.insightBody}>{insight.body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  periodNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  periodLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  insightTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  insightBody: {
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 19,
  },
  disclaimer: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: spacing.sm,
  },
});
