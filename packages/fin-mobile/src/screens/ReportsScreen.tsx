import React, { useState, useCallback } from "react";
import { ScrollView, RefreshControl, View, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { AiDigestSection } from "@/components/reports/AiDigestSection";
import { colors, spacing } from "@/theme";

type Tab = "monthly" | "quarterly";

const TAB_OPTIONS: Array<{ value: Tab; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export function ReportsScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("monthly");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["ai", "digest"] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} />
      <AiDigestSection scope={tab === "monthly" ? "monthly-digest" : "quarterly-digest"} />
      <View style={styles.bottomSpacer} />
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
  bottomSpacer: {
    height: spacing.xl,
  },
});
