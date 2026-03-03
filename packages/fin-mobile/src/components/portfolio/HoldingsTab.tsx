import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type {
  Holding,
  CreateHoldingRequest,
  UpdateHoldingRequest,
} from "@derekentringer/shared/finance";
import {
  useHoldings,
  useCreateHolding,
  useUpdateHolding,
  useDeleteHolding,
} from "@/hooks/useHoldings";
import { HoldingRow } from "@/components/portfolio/HoldingRow";
import { HoldingFormSheet } from "@/components/portfolio/HoldingFormSheet";
import { Card } from "@/components/common/Card";
import { SkeletonChartCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing } from "@/theme";

interface HoldingsTabProps {
  accountId?: string;
}

export function HoldingsTab({ accountId }: HoldingsTabProps) {
  const { data, isLoading, error, refetch } = useHoldings(accountId);
  const createHolding = useCreateHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();

  const [showForm, setShowForm] = useState(false);
  const [formHolding, setFormHolding] = useState<Holding | null>(null);

  const holdings = useMemo(() => {
    if (!data?.holdings) return [];
    return [...data.holdings].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data]);

  const summary = useMemo(() => {
    let totalMarketValue = 0;
    let totalCostBasis = 0;
    for (const h of holdings) {
      totalMarketValue += (h.shares ?? 0) * (h.currentPrice ?? 0);
      totalCostBasis += h.costBasis ?? 0;
    }
    const totalGainLoss = totalMarketValue - totalCostBasis;
    const totalGainLossPct =
      totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
    return { totalMarketValue, totalCostBasis, totalGainLoss, totalGainLossPct };
  }, [holdings]);

  const handleCreate = useCallback(
    async (formData: CreateHoldingRequest | UpdateHoldingRequest) => {
      await createHolding.mutateAsync(formData as CreateHoldingRequest);
      setShowForm(false);
    },
    [createHolding],
  );

  const handleUpdate = useCallback(
    async (formData: CreateHoldingRequest | UpdateHoldingRequest) => {
      if (!formHolding) return;
      await updateHolding.mutateAsync({
        id: formHolding.id,
        data: formData as UpdateHoldingRequest,
      });
      setShowForm(false);
      setFormHolding(null);
    },
    [formHolding, updateHolding],
  );

  const handleDeleteConfirm = useCallback(
    (holding: Holding) => {
      Alert.alert("Delete Holding", `Delete "${holding.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteHolding.mutate({ id: holding.id });
          },
        },
      ]);
    },
    [deleteHolding],
  );

  if (isLoading && !data) return <SkeletonChartCard height={200} />;
  if (error && !data) {
    return (
      <ErrorCard message="Failed to load holdings" onRetry={() => refetch()} />
    );
  }

  return (
    <View style={styles.container}>
      {holdings.length > 0 && (
        <Card>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Market Value</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {formatCurrencyFull(summary.totalMarketValue)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Cost Basis</Text>
              <Text style={styles.summaryValue}>
                {formatCurrencyFull(summary.totalCostBasis)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Gain/Loss</Text>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      summary.totalGainLoss >= 0
                        ? colors.success
                        : colors.error,
                  },
                ]}
              >
                {formatCurrencyFull(summary.totalGainLoss)} (
                {summary.totalGainLossPct >= 0 ? "+" : ""}
                {summary.totalGainLossPct.toFixed(1)}%)
              </Text>
            </View>
          </View>
        </Card>
      )}

      {holdings.length === 0 ? (
        <EmptyState
          message="No holdings yet"
          actionLabel="Add Holding"
          onAction={() => {
            setFormHolding(null);
            setShowForm(true);
          }}
        />
      ) : (
        holdings.map((holding) => (
          <HoldingRow
            key={holding.id}
            holding={holding}
            onEdit={() => {
              setFormHolding(holding);
              setShowForm(true);
            }}
            onDelete={() => handleDeleteConfirm(holding)}
          />
        ))
      )}

      {/* FAB */}
      {accountId && (
        <Pressable
          style={styles.fab}
          onPress={() => {
            setFormHolding(null);
            setShowForm(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add holding"
        >
          <MaterialCommunityIcons name="plus" size={28} color="#ffffff" />
        </Pressable>
      )}

      {showForm && (
        <HoldingFormSheet
          holding={formHolding}
          accountId={accountId}
          onClose={() => {
            setShowForm(false);
            setFormHolding(null);
          }}
          onSubmit={formHolding ? handleUpdate : handleCreate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  summaryValue: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
