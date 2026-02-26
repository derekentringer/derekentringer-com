import React, { useState, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, Text, RefreshControl, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ACCOUNT_TYPE_GROUPS, type CreateAccountRequest, type UpdateAccountRequest } from "@derekentringer/shared/finance";
import type { AccountsStackParamList } from "@/navigation/types";
import { useAccounts, useCreateAccount } from "@/hooks/useAccounts";
import { AccountGroupHeader } from "@/components/accounts/AccountGroupHeader";
import { AccountFormSheet } from "@/components/accounts/AccountFormSheet";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorCard } from "@/components/common/ErrorCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { colors, spacing, borderRadius } from "@/theme";

export function AccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AccountsStackParamList>>();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useAccounts();
  const createMutation = useCreateAccount();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const groups = useMemo(() => {
    if (!data?.accounts) return [];
    return ACCOUNT_TYPE_GROUPS
      .map((group) => {
        const accounts = data.accounts.filter((a) =>
          group.types.includes(a.type),
        );
        if (accounts.length === 0) return null;
        const totalBalance = accounts.reduce(
          (sum, a) => sum + a.currentBalance,
          0,
        );
        return {
          slug: group.slug,
          label: group.label,
          count: accounts.length,
          totalBalance,
        };
      })
      .filter(Boolean) as Array<{
      slug: string;
      label: string;
      count: number;
      totalBalance: number;
    }>;
  }, [data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const handleGroupPress = useCallback(
    (groupSlug: string, groupLabel: string) => {
      navigation.navigate("AccountType", { groupSlug, groupLabel });
    },
    [navigation],
  );

  const handleCreate = useCallback(
    async (formData: CreateAccountRequest | UpdateAccountRequest) => {
      await createMutation.mutateAsync(formData as CreateAccountRequest);
      setShowForm(false);
    },
    [createMutation],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonList}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <ErrorCard message="Failed to load accounts" onRetry={() => refetch()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groups.length === 0 ? (
        <EmptyState
          message="Add your first account to get started."
          actionLabel="Add Account"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.slug}
          renderItem={({ item }) => (
            <AccountGroupHeader
              label={item.label}
              count={item.count}
              totalBalance={item.totalBalance}
              onPress={() => handleGroupPress(item.slug, item.label)}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => setShowForm(true)}
        accessibilityRole="button"
        accessibilityLabel="Add account"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {showForm && (
        <AccountFormSheet
          onClose={() => setShowForm(false)}
          onSubmit={handleCreate}
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
    padding: spacing.md,
  },
  separator: {
    height: spacing.sm,
  },
  skeletonList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorContainer: {
    padding: spacing.md,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
});
