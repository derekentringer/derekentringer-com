import React, { useState, useCallback } from "react";
import { ScrollView, View, RefreshControl, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { HysVsDebtTab } from "@/components/decision-tools/HysVsDebtTab";
import { FourOhOneKTab } from "@/components/decision-tools/FourOhOneKTab";
import { colors, spacing } from "@/theme";

type Tab = "hys-vs-debt" | "401k";

const TAB_OPTIONS: Array<{ value: Tab; label: string }> = [
  { value: "hys-vs-debt", label: "HYS vs. Debt" },
  { value: "401k", label: "401(k)" },
];

export function DecisionToolsScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("hys-vs-debt");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
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

      {tab === "hys-vs-debt" && <HysVsDebtTab />}
      {tab === "401k" && <FourOhOneKTab />}

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
