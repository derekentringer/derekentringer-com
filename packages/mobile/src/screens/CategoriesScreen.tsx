import React, { useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, Alert, RefreshControl, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type { Category } from "@derekentringer/shared/finance";
import { SwipeableRow } from "@/components/transactions/SwipeableRow";
import { CategoryFormSheet } from "@/components/settings/CategoryFormSheet";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/hooks/useCategories";
import { colors, spacing, borderRadius } from "@/theme";

export function CategoriesScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const handleAdd = useCallback(() => {
    setEditingCategory(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((category: Category) => {
    setEditingCategory(category);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    (category: Category) => {
      if (category.isDefault) return;
      Alert.alert(
        "Delete Category",
        `Are you sure you want to delete "${category.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMutation.mutate({ id: category.id }),
          },
        ],
      );
    },
    [deleteMutation],
  );

  const handleSubmit = useCallback(
    async (data: { name: string }) => {
      if (editingCategory) {
        await updateMutation.mutateAsync({ id: editingCategory.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      setShowForm(false);
      setEditingCategory(null);
    },
    [editingCategory, createMutation, updateMutation],
  );

  const categories = data?.categories ?? [];

  const renderItem = useCallback(
    ({ item }: { item: Category }) => (
      <SwipeableRow
        onEdit={() => handleEdit(item)}
        onDelete={item.isDefault ? undefined : () => handleDelete(item)}
      >
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowName}>{item.name}</Text>
            {item.isDefault && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Default</Text>
              </View>
            )}
          </View>
        </View>
      </SwipeableRow>
    ),
    [handleEdit, handleDelete],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={categories.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          !isLoading ? <EmptyState message="No categories yet" actionLabel="Add Category" onAction={handleAdd} /> : null
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
        accessibilityLabel="Add category"
      >
        <MaterialCommunityIcons name="plus" size={24} color={colors.foreground} />
      </Pressable>

      {showForm && (
        <CategoryFormSheet
          category={editingCategory}
          onClose={() => {
            setShowForm(false);
            setEditingCategory(null);
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  rowName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.foreground,
    fontSize: 10,
    fontWeight: "600",
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
