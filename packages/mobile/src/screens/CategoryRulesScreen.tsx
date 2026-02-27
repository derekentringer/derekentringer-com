import React, { useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, Alert, RefreshControl, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type { CategoryRule, RuleMatchType } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { CategoryRuleFormSheet } from "@/components/settings/CategoryRuleFormSheet";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useCategoryRules,
  useCreateCategoryRule,
  useUpdateCategoryRule,
  useDeleteCategoryRule,
} from "@/hooks/useCategoryRules";
import { colors, spacing, borderRadius } from "@/theme";

export function CategoryRulesScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useCategoryRules();
  const createMutation = useCreateCategoryRule();
  const updateMutation = useUpdateCategoryRule();
  const deleteMutation = useDeleteCategoryRule();

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CategoryRule | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["categoryRules"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const handleAdd = useCallback(() => {
    setEditingRule(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((rule: CategoryRule) => {
    setEditingRule(rule);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    (rule: CategoryRule) => {
      Alert.alert(
        "Delete Rule",
        `Delete rule "${rule.pattern}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMutation.mutate({ id: rule.id }),
          },
        ],
      );
    },
    [deleteMutation],
  );

  const handleSubmit = useCallback(
    async (
      data: { pattern: string; matchType: RuleMatchType; category: string; priority?: number },
      apply: boolean,
    ) => {
      if (editingRule) {
        await updateMutation.mutateAsync({ id: editingRule.id, data, apply });
      } else {
        await createMutation.mutateAsync({ data, apply });
      }
      setShowForm(false);
      setEditingRule(null);
    },
    [editingRule, createMutation, updateMutation],
  );

  const rules = data?.categoryRules ?? [];

  const renderItem = useCallback(
    ({ item }: { item: CategoryRule }) => (
      <SwipeableRow
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item)}
      >
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowPattern} numberOfLines={1}>
              {item.pattern}
            </Text>
            <View style={styles.rowMeta}>
              <View style={styles.matchBadge}>
                <Text style={styles.matchBadgeText}>
                  {item.matchType === "exact" ? "Exact" : "Contains"}
                </Text>
              </View>
              <Text style={styles.rowCategory} numberOfLines={1}>
                {item.category}
              </Text>
              <Text style={styles.rowPriority}>P{item.priority}</Text>
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
        data={rules}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={rules.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          !isLoading ? <EmptyState message="No category rules yet" actionLabel="Add Rule" onAction={handleAdd} /> : null
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
        accessibilityLabel="Add category rule"
      >
        <MaterialCommunityIcons name="plus" size={24} color={colors.foreground} />
      </Pressable>

      {showForm && (
        <CategoryRuleFormSheet
          rule={editingRule}
          onClose={() => {
            setShowForm(false);
            setEditingRule(null);
          }}
          onSubmit={handleSubmit}
        />
      )}
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
  rowPattern: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  matchBadge: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  matchBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  rowCategory: {
    color: colors.mutedForeground,
    fontSize: 12,
    flex: 1,
  },
  rowPriority: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
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
