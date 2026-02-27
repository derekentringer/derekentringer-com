import React, { useCallback, useMemo, useLayoutEffect } from "react";
import { View, Text, SectionList, Pressable, Alert, RefreshControl, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { NOTIFICATION_LABELS } from "@derekentringer/shared/finance";
import type { NotificationLogEntry } from "@derekentringer/shared/finance";
import { EmptyState } from "@/components/common/EmptyState";
import { DateSectionHeader, groupByMonth } from "@/components/common/DateSectionHeader";
import {
  useNotificationHistory,
  useMarkAllRead,
  useClearHistory,
} from "@/hooks/useNotifications";
import { colors, spacing, borderRadius } from "@/theme";

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationHistoryScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useNotificationHistory();
  const markAllMutation = useMarkAllRead();
  const clearMutation = useClearHistory();

  const notifications = useMemo(
    () => data?.pages.flatMap((p) => p.notifications) ?? [],
    [data],
  );

  const sections = useMemo(
    () => groupByMonth(notifications, (n) => n.sentAt),
    [notifications],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
          >
            <Text style={styles.headerAction}>Mark Read</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert("Clear History", "Remove all notification history?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: () => clearMutation.mutate(),
                },
              ]);
            }}
            disabled={clearMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Clear history"
          >
            <Text style={[styles.headerAction, styles.headerActionDestructive]}>Clear</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, markAllMutation, clearMutation]);

  const onRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [queryClient]);

  const renderItem = useCallback(
    ({ item }: { item: NotificationLogEntry }) => (
      <View style={[styles.row, !item.isRead && styles.rowUnread]}>
        <View style={styles.rowHeader}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {NOTIFICATION_LABELS[item.type]}
            </Text>
          </View>
          <Text style={styles.timeText}>{formatRelativeTime(item.sentAt)}</Text>
          {!item.isRead && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
    ),
    [],
  );

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={({ section: { title } }) => (
        <DateSectionHeader title={title} />
      )}
      stickySectionHeadersEnabled
      contentContainerStyle={
        notifications.length === 0 ? styles.emptyContainer : styles.listContent
      }
      ListEmptyComponent={
        !isLoading ? <EmptyState message="No notifications yet" /> : null
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl * 2,
  },
  emptyContainer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  headerAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "500",
  },
  headerActionDestructive: {
    color: colors.destructive,
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowUnread: {
    backgroundColor: "rgba(37,99,235,0.05)",
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 4,
  },
  typeBadge: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  timeText: {
    color: colors.mutedForeground,
    fontSize: 11,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  rowTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowBody: {
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 18,
  },
});
