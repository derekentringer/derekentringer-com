import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "@/navigation/types";
import useAuthStore from "@/store/authStore";
import useSyncStore from "@/store/syncStore";
import useAiSettingsStore, {
  type AutoApproveSettings,
} from "@/store/aiSettingsStore";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { useTrashCount } from "@/hooks/useTrash";
import { manualSync } from "@/lib/syncEngine";
import { getSyncQueueCount } from "@/lib/noteStore";
import { SyncIssuesSheet } from "@/components/sync/SyncIssuesSheet";
import { useQuery } from "@tanstack/react-query";

type Props = NativeStackScreenProps<SettingsStackParamList, "SettingsHome">;

export function SettingsScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data: trashCount } = useTrashCount();
  const syncStatus = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const rejections = useSyncStore((s) => s.rejections);
  const syncIssuesRef = useRef<BottomSheetModal>(null);

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["syncQueueCount"],
    queryFn: getSyncQueueCount,
    refetchInterval: 10_000,
  });

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch {
            // Still logged out locally even if API call fails
          }
        },
      },
    ]);
  };

  const handleSyncNow = useCallback(() => {
    manualSync();
  }, []);

  const formatLastSynced = () => {
    if (!lastSyncedAt) return "Never";
    const date = new Date(lastSyncedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  };

  const styles = makeStyles(themeColors);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email ?? "—"}</Text>
        </View>
      </View>

      {/* Sync section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync</Text>
        <View style={styles.card}>
          <View style={styles.syncRow}>
            <Text style={styles.syncLabel}>Status</Text>
            <View style={styles.syncValueRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      syncStatus === "idle"
                        ? "#4ade80"
                        : syncStatus === "syncing"
                          ? themeColors.primary
                          : syncStatus === "offline"
                            ? themeColors.muted
                            : themeColors.destructive,
                  },
                ]}
              />
              <Text style={styles.syncValue}>
                {syncStatus === "idle"
                  ? "Up to date"
                  : syncStatus === "syncing"
                    ? "Syncing..."
                    : syncStatus === "offline"
                      ? "Offline"
                      : "Error"}
              </Text>
            </View>
          </View>
          <View style={styles.syncRow}>
            <Text style={styles.syncLabel}>Last synced</Text>
            <Text style={styles.syncValue}>{formatLastSynced()}</Text>
          </View>
          {pendingCount > 0 ? (
            <View style={styles.syncRow}>
              <Text style={styles.syncLabel}>Pending changes</Text>
              <Text style={[styles.syncValue, { color: themeColors.primary }]}>{pendingCount}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={[styles.menuRow, { marginTop: spacing.sm }]}
          onPress={handleSyncNow}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
        >
          <MaterialCommunityIcons
            name="cloud-sync"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={styles.menuRowText}>Sync Now</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={themeColors.muted}
          />
        </Pressable>

        {rejections.length > 0 ? (
          <Pressable
            style={[styles.menuRow, { marginTop: spacing.sm }]}
            onPress={() => syncIssuesRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel="View sync issues"
          >
            <MaterialCommunityIcons
              name="cloud-alert"
              size={20}
              color={themeColors.destructive}
            />
            <Text style={styles.menuRowText}>Sync Issues</Text>
            <View style={styles.menuRowRight}>
              <View
                style={[styles.badge, { backgroundColor: themeColors.destructive }]}
              >
                <Text style={styles.badgeText}>{rejections.length}</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={themeColors.muted}
              />
            </View>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Assistant</Text>
        <AiSettingsSection />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <Pressable
          style={styles.menuRow}
          onPress={() => navigation.navigate("Trash")}
          accessibilityRole="button"
          accessibilityLabel="Open trash"
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={styles.menuRowText}>Trash</Text>
          <View style={styles.menuRowRight}>
            {trashCount != null && trashCount > 0 ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: themeColors.destructive },
                ]}
              >
                <Text style={styles.badgeText}>{trashCount}</Text>
              </View>
            ) : null}
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={themeColors.muted}
            />
          </View>
        </Pressable>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <SyncIssuesSheet bottomSheetRef={syncIssuesRef} />
    </ScrollView>
  );
}

// ─── AI Settings Section ─────────────────────────────────────────

function AiSettingsSection() {
  const themeColors = useThemeColors();
  const styles = makeStyles(themeColors);
  const masterAiEnabled = useAiSettingsStore((s) => s.masterAiEnabled);
  const qaAssistant = useAiSettingsStore((s) => s.qaAssistant);
  const autoApprove = useAiSettingsStore((s) => s.autoApprove);
  const setMasterAiEnabled = useAiSettingsStore((s) => s.setMasterAiEnabled);
  const setQaAssistant = useAiSettingsStore((s) => s.setQaAssistant);
  const setAutoApprove = useAiSettingsStore((s) => s.setAutoApprove);

  const renderToggle = (
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    info?: string,
  ) => (
    <View style={styles.toggleRow} key={label}>
      <View style={styles.toggleLabelWrap}>
        <Text style={styles.menuRowText}>{label}</Text>
        {info && (
          <Text style={[styles.toggleInfo, { color: themeColors.muted }]}>
            {info}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          false: themeColors.input,
          true: themeColors.primary,
        }}
        thumbColor="#fff"
      />
    </View>
  );

  // Per-tool auto-approve list — only meaningful when master + QA
  // are both enabled.
  const showAutoApprove = masterAiEnabled && qaAssistant;
  const autoApproveLabels: Array<{ key: keyof AutoApproveSettings; label: string; info: string }> = [
    {
      key: "deleteNote",
      label: "Move notes to Trash",
      info: "Auto-approve `delete_note`. Notes go to Trash and can be restored until the trash auto-delete timer purges them.",
    },
    {
      key: "deleteFolder",
      label: "Delete folders",
      info: "Auto-approve `delete_folder`. Notes inside become Unfiled.",
    },
    {
      key: "updateNoteContent",
      label: "Rewrite note content",
      info: "Auto-approve `update_note_content`. Previous version stays in version history.",
    },
    {
      key: "renameNote",
      label: "Rename notes",
      info: "Auto-approve `rename_note`. Title only; content / folder / tags / id are unchanged.",
    },
    {
      key: "renameFolder",
      label: "Rename folders",
      info: "Auto-approve `rename_folder`.",
    },
    {
      key: "renameTag",
      label: "Rename tags",
      info: "Auto-approve `rename_tag`. Affects every note using that tag.",
    },
  ];

  return (
    <View>
      {renderToggle("AI features", masterAiEnabled, setMasterAiEnabled,
        "Master gate for all AI calls. Off disables the AI tab entirely.")}
      {masterAiEnabled &&
        renderToggle("AI Assistant chat", qaAssistant, setQaAssistant,
          "Q&A panel + slash commands.")}
      {showAutoApprove && (
        <View style={styles.autoApproveBlock}>
          <Text
            style={[
              styles.autoApproveHeading,
              { color: themeColors.muted },
            ]}
          >
            Auto-approve destructive actions
          </Text>
          <Text style={[styles.toggleInfo, { color: themeColors.muted }]}>
            When off, Claude waits for your confirmation. Enable sparingly.
          </Text>
          {autoApproveLabels.map(({ key, label, info }) =>
            renderToggle(
              label,
              autoApprove[key],
              (v) => setAutoApprove(key, v),
              info,
            ),
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(themeColors: ReturnType<typeof import("@/theme/colors").useThemeColors>) {
  return StyleSheet.create({
    // Outer ScrollView style takes flex + bg only; padding moves
    // to `scrollContent` so the bottom inset can grow without
    // clipping the auto-approve list above the tab bar.
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    scrollContent: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      color: themeColors.muted,
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    card: {
      backgroundColor: themeColors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    label: {
      color: themeColors.muted,
      fontSize: 12,
      marginBottom: spacing.xs,
    },
    value: {
      color: themeColors.foreground,
      fontSize: 16,
    },
    syncRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
    },
    syncLabel: {
      color: themeColors.muted,
      fontSize: 14,
    },
    syncValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    syncValue: {
      color: themeColors.foreground,
      fontSize: 14,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: themeColors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: themeColors.border,
      gap: spacing.sm,
    },
    menuRowText: {
      color: themeColors.foreground,
      fontSize: 16,
      flex: 1,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: themeColors.card,
      borderWidth: 1,
      borderColor: themeColors.border,
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    toggleLabelWrap: { flex: 1 },
    toggleInfo: {
      fontSize: 11,
      marginTop: 2,
    },
    autoApproveBlock: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
    },
    autoApproveHeading: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: spacing.xs,
      letterSpacing: 0.5,
    },
    menuRowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    badge: {
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    badgeText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "700",
    },
    logoutButton: {
      backgroundColor: themeColors.destructive,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm + 4,
      alignItems: "center",
      marginTop: spacing.lg,
    },
    logoutText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
