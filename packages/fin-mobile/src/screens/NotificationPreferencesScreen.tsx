import React, { useState, useCallback, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  Switch,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  NotificationType,
  NOTIFICATION_LABELS,
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_CATEGORIES,
} from "@derekentringer/shared/finance";
import type { NotificationPreference } from "@derekentringer/shared/finance";
import { Card } from "@/components/common/Card";
import { NotificationConfigSheet } from "@/components/notifications/NotificationConfigSheet";
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
  useSendTestNotification,
} from "@/hooks/useNotifications";
import type { MoreStackParamList } from "@/navigation/types";
import { colors, spacing, borderRadius } from "@/theme";

type CategoryGroup = "reminders" | "alerts" | "milestones";

const CATEGORY_TITLES: Record<CategoryGroup, string> = {
  reminders: "Reminders",
  alerts: "Alerts",
  milestones: "Milestones",
};

export function NotificationPreferencesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreference();
  const testMutation = useSendTestNotification();

  const [configPref, setConfigPref] = useState<NotificationPreference | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  const prefMap = useMemo(() => {
    const map = new Map<NotificationType, NotificationPreference>();
    for (const pref of data?.preferences ?? []) {
      map.set(pref.type, pref);
    }
    return map;
  }, [data]);

  const grouped = useMemo(() => {
    const groups: Record<CategoryGroup, NotificationType[]> = {
      reminders: [],
      alerts: [],
      milestones: [],
    };
    for (const type of Object.values(NotificationType)) {
      const cat = NOTIFICATION_CATEGORIES[type] as CategoryGroup;
      groups[cat].push(type);
    }
    return groups;
  }, []);

  const handleToggle = useCallback(
    (type: NotificationType, enabled: boolean) => {
      updateMutation.mutate({ type, data: { enabled } });
    },
    [updateMutation],
  );

  const handleConfigSubmit = useCallback(
    async (config: Record<string, unknown>) => {
      if (!configPref) return;
      await updateMutation.mutateAsync({
        type: configPref.type,
        data: { config: config as any },
      });
      setConfigPref(null);
    },
    [configPref, updateMutation],
  );

  const handleTestNotification = useCallback(() => {
    testMutation.mutate(undefined, {
      onSuccess: () => {
        Alert.alert("Test Sent", "A test notification has been sent to your registered devices.");
      },
      onError: () => {
        Alert.alert("Error", "Failed to send test notification. Make sure you have a registered device.");
      },
    });
  }, [testMutation]);

  const renderPreferenceRow = (type: NotificationType) => {
    const pref = prefMap.get(type);
    const enabled = pref?.enabled ?? false;
    const hasConfig = type !== NotificationType.AiAlert;

    return (
      <View key={type} style={styles.prefRow}>
        <View style={styles.prefInfo}>
          <Text style={styles.prefLabel}>{NOTIFICATION_LABELS[type]}</Text>
          <Text style={styles.prefDescription}>{NOTIFICATION_DESCRIPTIONS[type]}</Text>
        </View>
        <View style={styles.prefActions}>
          {hasConfig && pref && (
            <Pressable
              onPress={() => setConfigPref(pref)}
              style={styles.gearButton}
              accessibilityRole="button"
              accessibilityLabel={`Configure ${NOTIFICATION_LABELS[type]}`}
            >
              <MaterialCommunityIcons name="cog-outline" size={18} color={colors.muted} />
            </Pressable>
          )}
          <Switch
            value={enabled}
            onValueChange={(v) => handleToggle(type, v)}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* History link */}
      <Card>
        <Pressable
          style={styles.historyRow}
          onPress={() => navigation.navigate("NotificationHistory")}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="history" size={20} color={colors.primary} />
          <Text style={styles.historyText}>View Notification History</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>
      </Card>

      {/* Grouped preferences */}
      {(["reminders", "alerts", "milestones"] as CategoryGroup[]).map((cat) => (
        <View key={cat} style={styles.group}>
          <Text style={styles.groupTitle}>{CATEGORY_TITLES[cat]}</Text>
          <Card>
            {grouped[cat].map((type, i) => (
              <React.Fragment key={type}>
                {i > 0 && <View style={styles.separator} />}
                {renderPreferenceRow(type)}
              </React.Fragment>
            ))}
          </Card>
        </View>
      ))}

      {/* Test notification */}
      <Pressable
        style={[styles.testButton, testMutation.isPending && styles.testButtonDisabled]}
        onPress={handleTestNotification}
        disabled={testMutation.isPending}
        accessibilityRole="button"
      >
        <Text style={styles.testButtonText}>
          {testMutation.isPending ? "Sending..." : "Send Test Notification"}
        </Text>
      </Pressable>

      <View style={styles.bottomSpacer} />

      {configPref && (
        <NotificationConfigSheet
          preference={configPref}
          onClose={() => setConfigPref(null)}
          onSubmit={handleConfigSubmit}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  historyText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: spacing.xs,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  prefInfo: {
    flex: 1,
    gap: 2,
  },
  prefLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  prefDescription: {
    color: colors.mutedForeground,
    fontSize: 11,
  },
  prefActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  gearButton: {
    padding: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  testButton: {
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  testButtonDisabled: {
    opacity: 0.5,
  },
  testButtonText: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
