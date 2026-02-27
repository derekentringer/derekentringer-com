import React, { useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type {
  IncomeSource,
  IncomeSourceFrequency,
} from "@derekentringer/shared/finance";
import { INCOME_SOURCE_FREQUENCY_LABELS } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { IncomeSourceFormSheet } from "@/components/settings/IncomeSourceFormSheet";
import { PinGateModal } from "@/components/common/PinGateModal";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useIncomeSources,
  useDetectedIncome,
  useCreateIncomeSource,
  useUpdateIncomeSource,
  useDeleteIncomeSource,
} from "@/hooks/useIncomeSources";
import { colors, spacing, borderRadius } from "@/theme";

export function IncomeSourcesScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useIncomeSources();
  const detectedQuery = useDetectedIncome();
  const createMutation = useCreateIncomeSource();
  const updateMutation = useUpdateIncomeSource();
  const deleteMutation = useDeleteIncomeSource();

  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["incomeSources"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const handleAdd = useCallback(() => {
    setEditingSource(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((source: IncomeSource) => {
    setEditingSource(source);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((source: IncomeSource) => {
    setPendingDeleteId(source.id);
    setShowPin(true);
  }, []);

  const handlePinVerified = useCallback(() => {
    setShowPin(false);
    if (pendingDeleteId) {
      deleteMutation.mutate({ id: pendingDeleteId });
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, deleteMutation]);

  const handleSubmit = useCallback(
    async (formData: {
      name: string;
      amount: number;
      frequency: IncomeSourceFrequency;
      isActive?: boolean;
      notes?: string | null;
    }) => {
      if (editingSource) {
        await updateMutation.mutateAsync({ id: editingSource.id, data: formData });
      } else {
        const { notes, ...rest } = formData;
        await createMutation.mutateAsync({ ...rest, notes: notes ?? undefined });
      }
      setShowForm(false);
      setEditingSource(null);
    },
    [editingSource, createMutation, updateMutation],
  );

  const sources = data?.incomeSources ?? [];

  const renderItem = useCallback(
    ({ item }: { item: IncomeSource }) => (
      <SwipeableRow
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item)}
      >
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.rowMeta}>
              <Text style={styles.rowAmount}>
                ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
              <View style={styles.freqBadge}>
                <Text style={styles.freqBadgeText}>
                  {INCOME_SOURCE_FREQUENCY_LABELS[item.frequency]}
                </Text>
              </View>
              <View style={[styles.statusBadge, !item.isActive && styles.statusInactive]}>
                <Text style={[styles.statusText, !item.isActive && styles.statusTextInactive]}>
                  {item.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </SwipeableRow>
    ),
    [handleEdit, handleDelete],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={sources.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          !isLoading ? <EmptyState message="No income sources yet" actionLabel="Add Income Source" onAction={handleAdd} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <Pressable
        style={styles.fab}
        onPress={handleAdd}
        accessibilityRole="button"
        accessibilityLabel="Add income source"
      >
        <MaterialCommunityIcons name="plus" size={24} color={colors.foreground} />
      </Pressable>

      {showForm && (
        <IncomeSourceFormSheet
          incomeSource={editingSource}
          detectedPatterns={!editingSource ? detectedQuery.data?.patterns : undefined}
          onClose={() => {
            setShowForm(false);
            setEditingSource(null);
          }}
          onSubmit={handleSubmit}
        />
      )}

      <PinGateModal
        visible={showPin}
        onClose={() => {
          setShowPin(false);
          setPendingDeleteId(null);
        }}
        onVerified={handlePinVerified}
        title="Confirm Delete"
        description="Enter PIN to delete this income source"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl * 3,
  },
  emptyContainer: {
    flex: 1,
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: {
    gap: 4,
  },
  rowName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowAmount: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  freqBadge: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  freqBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  statusBadge: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusInactive: {
    backgroundColor: "rgba(153,153,153,0.15)",
  },
  statusText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "600",
  },
  statusTextInactive: {
    color: colors.muted,
  },
  fab: {
    position: "absolute",
    bottom: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
