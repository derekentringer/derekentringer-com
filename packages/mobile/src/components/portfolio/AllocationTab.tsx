import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import type {
  AssetClass,
  SetTargetAllocationsRequest,
} from "@derekentringer/shared/finance";
import { ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import {
  useAssetAllocation,
  useTargetAllocations,
  useSetTargetAllocations,
} from "@/hooks/usePortfolio";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import { FormField } from "@/components/common/FormField";
import { CATEGORY_COLORS, formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

interface AllocationTabProps {
  accountId?: string;
}

const PRESETS: Record<string, Record<AssetClass, number>> = {
  Aggressive: {
    stocks: 85,
    bonds: 5,
    real_estate: 5,
    cash: 5,
    crypto: 0,
    other: 0,
  },
  Moderate: {
    stocks: 60,
    bonds: 30,
    real_estate: 5,
    cash: 5,
    crypto: 0,
    other: 0,
  },
  Conservative: {
    stocks: 40,
    bonds: 40,
    real_estate: 10,
    cash: 10,
    crypto: 0,
    other: 0,
  },
};

const ASSET_CLASSES: AssetClass[] = [
  "stocks",
  "bonds",
  "real_estate",
  "cash",
  "crypto",
  "other",
];

export function AllocationTab({ accountId }: AllocationTabProps) {
  const allocationQuery = useAssetAllocation(accountId);
  const targetsQuery = useTargetAllocations(accountId);
  const setTargets = useSetTargetAllocations();

  const [editTargets, setEditTargets] = useState<Record<AssetClass, string>>(
    {} as Record<AssetClass, string>,
  );
  const [showTargetForm, setShowTargetForm] = useState(false);

  // Initialize target form from current targets
  const initTargetForm = useCallback(() => {
    const current: Record<AssetClass, string> = {} as Record<
      AssetClass,
      string
    >;
    for (const ac of ASSET_CLASSES) {
      const existing = targetsQuery.data?.allocations?.find(
        (t) => t.assetClass === ac,
      );
      current[ac] = existing ? String(existing.targetPct) : "0";
    }
    setEditTargets(current);
    setShowTargetForm(true);
  }, [targetsQuery.data]);

  const applyPreset = useCallback((preset: Record<AssetClass, number>) => {
    const targets: Record<AssetClass, string> = {} as Record<
      AssetClass,
      string
    >;
    for (const ac of ASSET_CLASSES) {
      targets[ac] = String(preset[ac]);
    }
    setEditTargets(targets);
  }, []);

  const handleSaveTargets = useCallback(async () => {
    const allocations = ASSET_CLASSES.filter(
      (ac) => parseFloat(editTargets[ac]) > 0,
    ).map((ac) => ({
      assetClass: ac,
      targetPct: parseFloat(editTargets[ac]) || 0,
    }));
    await setTargets.mutateAsync({
      allocations,
      ...(accountId ? { accountId } : {}),
    } as SetTargetAllocationsRequest);
    setShowTargetForm(false);
  }, [editTargets, accountId, setTargets]);

  const loading =
    (allocationQuery.isLoading && !allocationQuery.data) ||
    (targetsQuery.isLoading && !targetsQuery.data);
  if (loading) return <SkeletonChartCard height={250} />;
  if (allocationQuery.error && !allocationQuery.data) {
    return (
      <ErrorCard
        message="Failed to load allocation"
        onRetry={() => allocationQuery.refetch()}
      />
    );
  }

  const slices = allocationQuery.data?.slices ?? [];
  const totalMarketValue = slices.reduce((sum, s) => sum + s.marketValue, 0);

  const pieData = slices.map((slice, i) => ({
    value: slice.marketValue,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    text: `${slice.percentage.toFixed(0)}%`,
  }));

  return (
    <View style={styles.container}>
      {/* Donut Chart */}
      {slices.length > 0 ? (
        <Card>
          <View style={styles.chartCenter}>
            <PieChart
              data={pieData}
              donut
              radius={90}
              innerRadius={55}
              innerCircleColor={colors.card}
              centerLabelComponent={() => (
                <View style={styles.centerLabel}>
                  <Text style={styles.centerLabelText}>
                    {formatCurrencyFull(totalMarketValue)}
                  </Text>
                  <Text style={styles.centerLabelSub}>Total</Text>
                </View>
              )}
            />
          </View>
          <View style={styles.legend}>
            {slices.map((slice, i) => {
              const drift =
                slice.targetPct !== undefined
                  ? Math.abs(slice.percentage - slice.targetPct)
                  : null;
              const driftColor =
                drift === null
                  ? colors.muted
                  : drift < 2
                    ? colors.success
                    : drift < 5
                      ? "#f59e0b"
                      : colors.error;
              return (
                <View key={slice.assetClass} style={styles.legendRow}>
                  <View
                    style={[
                      styles.legendDot,
                      {
                        backgroundColor:
                          CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      },
                    ]}
                  />
                  <Text style={styles.legendLabel}>
                    {ASSET_CLASS_LABELS[slice.assetClass]}
                  </Text>
                  <Text style={styles.legendPct}>
                    {slice.percentage.toFixed(1)}%
                  </Text>
                  <Text style={styles.legendValue}>
                    {formatCurrencyFull(slice.marketValue)}
                  </Text>
                  {drift !== null && (
                    <View
                      style={[
                        styles.driftBadge,
                        { backgroundColor: driftColor + "20" },
                      ]}
                    >
                      <Text style={[styles.driftText, { color: driftColor }]}>
                        {drift.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </Card>
      ) : (
        <EmptyState message="No investment holdings to show allocation" />
      )}

      {/* Target Allocation Form */}
      <Card>
        <View style={styles.targetHeader}>
          <Text style={styles.targetTitle}>Target Allocation</Text>
          <Pressable onPress={initTargetForm} accessibilityRole="button">
            <Text style={styles.editLink}>
              {showTargetForm ? "Cancel" : "Edit"}
            </Text>
          </Pressable>
        </View>

        {showTargetForm ? (
          <View style={styles.targetForm}>
            <View style={styles.presetRow}>
              {Object.entries(PRESETS).map(([label, preset]) => (
                <Pressable
                  key={label}
                  style={styles.presetButton}
                  onPress={() => applyPreset(preset)}
                  accessibilityRole="button"
                >
                  <Text style={styles.presetButtonText}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {ASSET_CLASSES.map((ac) => (
              <View key={ac} style={styles.targetRow}>
                <Text style={styles.targetRowLabel}>
                  {ASSET_CLASS_LABELS[ac]}
                </Text>
                <FormField
                  label=""
                  value={editTargets[ac] ?? "0"}
                  onChangeText={(v) =>
                    setEditTargets((prev) => ({ ...prev, [ac]: v }))
                  }
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
            <Pressable
              style={styles.saveButton}
              onPress={handleSaveTargets}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>
                {setTargets.isPending ? "Saving..." : "Save Targets"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.targetSummary}>
            {targetsQuery.data?.allocations && targetsQuery.data.allocations.length > 0 ? (
              targetsQuery.data.allocations.map((t: import("@derekentringer/shared/finance").TargetAllocation) => (
                <View key={t.assetClass} style={styles.targetSummaryRow}>
                  <Text style={styles.targetSummaryLabel}>
                    {ASSET_CLASS_LABELS[t.assetClass]}
                  </Text>
                  <Text style={styles.targetSummaryPct}>
                    {t.targetPct}%
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.noTargetsText}>
                No target allocation set. Tap Edit to configure.
              </Text>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  chartCenter: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  centerLabel: {
    alignItems: "center",
  },
  centerLabelText: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "700",
  },
  centerLabelSub: {
    color: colors.muted,
    fontSize: 10,
  },
  legend: {
    gap: spacing.xs,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: colors.foreground,
    fontSize: 12,
    flex: 1,
  },
  legendPct: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "600",
    width: 40,
    textAlign: "right",
  },
  legendValue: {
    color: colors.muted,
    fontSize: 11,
    width: 80,
    textAlign: "right",
  },
  driftBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 4,
  },
  driftText: {
    fontSize: 9,
    fontWeight: "600",
  },
  targetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  targetTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  editLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "500",
  },
  targetForm: {
    gap: spacing.sm,
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  presetButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs + 2,
    alignItems: "center",
  },
  presetButtonText: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: "500",
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  targetRowLabel: {
    color: colors.foreground,
    fontSize: 12,
    width: 80,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  targetSummary: {
    gap: spacing.xs,
  },
  targetSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  targetSummaryLabel: {
    color: colors.foreground,
    fontSize: 13,
  },
  targetSummaryPct: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  noTargetsText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
});
