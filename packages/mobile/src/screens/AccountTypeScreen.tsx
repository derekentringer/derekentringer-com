import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, FlatList, RefreshControl, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ACCOUNT_TYPE_GROUPS } from "@derekentringer/shared/finance";
import type { AccountsStackParamList } from "@/navigation/types";
import { useAccounts } from "@/hooks/useAccounts";
import { AccountCard } from "@/components/accounts/AccountCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import { colors, spacing } from "@/theme";

export function AccountTypeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AccountsStackParamList>>();
  const route = useRoute();
  const queryClient = useQueryClient();
  const { groupSlug, groupLabel } = route.params as {
    groupSlug: string;
    groupLabel: string;
  };

  const { data, isLoading, error, refetch } = useAccounts();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: groupLabel });
  }, [navigation, groupLabel]);

  const group = useMemo(
    () => ACCOUNT_TYPE_GROUPS.find((g) => g.slug === groupSlug),
    [groupSlug],
  );

  const accounts = useMemo(() => {
    if (!data?.accounts || !group) return [];
    return data.accounts
      .filter((a) => group.types.includes(a.type))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data, group]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const handleAccountPress = useCallback(
    (accountId: string, accountName: string) => {
      navigation.navigate("AccountDetail", { accountId, accountName });
    },
    [navigation],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonList}>
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

  if (accounts.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState message="No accounts in this group." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AccountCard
            account={item}
            onPress={() => handleAccountPress(item.id, item.name)}
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
});
