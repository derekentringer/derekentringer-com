import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
} from "react-native";
import { useAppAlert } from "@/components/AppAlertProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BUILD_VERSION } from "@/buildInfo";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "@/navigation/types";
import useAuthStore from "@/store/authStore";
import useSyncStore from "@/store/syncStore";
import useAiSettingsStore, {
  type AutoApproveSettings,
} from "@/store/aiSettingsStore";
import useDashboardSettingsStore from "@/store/dashboardSettingsStore";
import useEditorSettingsStore, {
  type ThemeMode,
} from "@/store/editorSettingsStore";
import {
  ACCENT_PRESET_KEYS,
  ACCENT_PRESETS,
  type AccentColorPreset,
} from "@/lib/accentColors";
import { useThemeColors, useResolvedTheme } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { useTrashCount } from "@/hooks/useTrash";
import { manualSync } from "@/lib/syncEngine";
import { getSyncQueueCount } from "@/lib/noteStore";
import { SyncIssuesSheet } from "@/components/sync/SyncIssuesSheet";
import { useQuery } from "@tanstack/react-query";

type Props = NativeStackScreenProps<SettingsStackParamList, "SettingsHome">;

export function SettingsScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const showAlert = useAppAlert();
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

  const handleLogout = useCallback(() => {
    showAlert("Sign Out of Your Account", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
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
  }, [showAlert, logout]);

  const handleChangePassword = useCallback(() => {
    navigation.navigate("ChangePassword");
  }, [navigation]);

  const handleTwoFactorAuth = useCallback(() => {
    navigation.navigate("TwoFactorAuth");
  }, [navigation]);

  const totpEnabled = user?.totpEnabled === true;

  const handleResetSettings = useCallback(() => {
    showAlert(
      "Reset All Settings",
      "This resets every appearance, editor, dashboard, and AI preference back to defaults. Your notes, account, and sync state are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            // Mirror desktop/web's `localStorage.removeItem(...)` +
            // reload pattern. Mobile clears AsyncStorage keys for
            // every settings store, then re-hydrates so each store
            // snaps back to its DEFAULT_SETTINGS.
            try {
              await AsyncStorage.multiRemove([
                "ns-editor-settings",
                "ns-ai-settings",
                "ns-dashboard-settings",
              ]);
            } catch {
              // Non-fatal — hydrate below will fall back to defaults.
            }
            await Promise.all([
              useEditorSettingsStore.getState().hydrate(),
              useAiSettingsStore.getState().hydrate(),
              useDashboardSettingsStore.getState().hydrate(),
            ]);
            showAlert("Settings reset", "All preferences are back to defaults.");
          },
        },
      ],
    );
  }, [showAlert]);

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
      {/* Section order mirrors desktop/web's IA: customization
          (Appearance / Dashboard / AI) first because users tweak
          those most often, then data state (Sync / Data), then
          identity (My Account / Security) at the bottom. iOS-style
          "Apple ID at top" doesn't fit here — NoteSync's account
          surface is just email + password + 2FA. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <AppearanceSettingsSection />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dashboard</Text>
        <DashboardSettingsSection />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Assistant</Text>
        <AiSettingsSection />
      </View>

      {/* Sync section — kept above Data since the two are
          conceptually paired and Sync surfaces the most actionable
          state (pending changes, rejections). */}
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
          style={[styles.menuRow, { marginTop: spacing.xs }]}
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
            style={[styles.menuRow, { marginTop: spacing.xs }]}
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Account</Text>
        {/* Email rendered as a menu-row with the value on the right
            so its height + padding match every other row in this
            section. The earlier two-line stacked layout (label
            above value) made this card taller than the rest and
            broke the vertical rhythm. */}
        <View style={styles.menuRow}>
          <MaterialCommunityIcons
            name="email-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={[styles.menuRowText, { flex: 0 }]}>Email</Text>
          <Text
            style={[styles.menuRowValue, { color: themeColors.muted }]}
            numberOfLines={1}
          >
            {user?.email ?? "—"}
          </Text>
        </View>

        <Pressable
          style={[styles.menuRow, { marginTop: spacing.xs }]}
          onPress={handleChangePassword}
          accessibilityRole="button"
          accessibilityLabel="Change Password"
        >
          <MaterialCommunityIcons
            name="lock-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={styles.menuRowText}>Change Password</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={themeColors.muted}
            style={styles.menuRowChevron}
          />
        </Pressable>

        <Pressable
          style={[styles.menuRow, { marginTop: spacing.xs }]}
          onPress={handleResetSettings}
          accessibilityRole="button"
          accessibilityLabel="Reset All Settings"
        >
          <MaterialCommunityIcons
            name="restore"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={styles.menuRowText}>Reset All Settings</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={themeColors.muted}
            style={styles.menuRowChevron}
          />
        </Pressable>

        <Pressable
          style={[styles.menuRow, { marginTop: spacing.xs }]}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sign Out of Your Account"
        >
          <MaterialCommunityIcons
            name="logout"
            size={20}
            color={themeColors.destructive}
          />
          <Text style={[styles.menuRowText, { color: themeColors.destructive }]}>
            Sign Out of Your Account
          </Text>
        </Pressable>
      </View>

      {/* Security section — sign-in factors live here, separate from
          identity / data settings. Mirrors the Security tab in
          desktop/web's SettingsPage. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Pressable
          style={styles.menuRow}
          onPress={handleTwoFactorAuth}
          accessibilityRole="button"
          accessibilityLabel="Two-Factor Authentication"
        >
          <MaterialCommunityIcons
            name="shield-key-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={styles.menuRowText}>Two-Factor Authentication</Text>
          {totpEnabled ? (
            <View
              style={[
                styles.enabledBadge,
                { backgroundColor: `${themeColors.success}33` },
              ]}
            >
              <Text
                style={[
                  styles.enabledBadgeText,
                  { color: themeColors.success },
                ]}
              >
                Enabled
              </Text>
            </View>
          ) : null}
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={themeColors.muted}
            style={!totpEnabled ? styles.menuRowChevron : undefined}
          />
        </Pressable>
      </View>

      {/* About section — app metadata. Mirrors the web/desktop About
          section minus the "What's New" / Release Notes affordance. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.menuRow}>
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={[styles.menuRowText, { flex: 0 }]}>Version</Text>
          <Text
            style={[styles.menuRowValue, { color: themeColors.muted }]}
            numberOfLines={1}
          >
            {BUILD_VERSION}
          </Text>
        </View>

        <View style={[styles.menuRow, { marginTop: spacing.xs }]}>
          <MaterialCommunityIcons
            name="message-text-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={[styles.menuRowText, { flex: 0 }]}>Feedback</Text>
          <Text
            style={[styles.menuRowValue, { color: themeColors.muted }]}
          >
            Coming Soon
          </Text>
        </View>
      </View>

      <SyncIssuesSheet bottomSheetRef={syncIssuesRef} />
    </ScrollView>
  );
}

// ─── Appearance Settings Section ─────────────────────────────────

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "teams", label: "Grey" },
];

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_STEP = 1;

function AppearanceSettingsSection() {
  const themeColors = useThemeColors();
  const styles = makeStyles(themeColors);
  const resolvedTheme = useResolvedTheme();
  const theme = useEditorSettingsStore((s) => s.theme);
  const accentColor = useEditorSettingsStore((s) => s.accentColor);
  const editorFontSize = useEditorSettingsStore((s) => s.editorFontSize);
  const setTheme = useEditorSettingsStore((s) => s.setTheme);
  const setAccentColor = useEditorSettingsStore((s) => s.setAccentColor);
  const setEditorFontSize = useEditorSettingsStore(
    (s) => s.setEditorFontSize,
  );

  const decFont = useCallback(() => {
    setEditorFontSize(Math.max(FONT_SIZE_MIN, editorFontSize - FONT_SIZE_STEP));
  }, [editorFontSize, setEditorFontSize]);
  const incFont = useCallback(() => {
    setEditorFontSize(Math.min(FONT_SIZE_MAX, editorFontSize + FONT_SIZE_STEP));
  }, [editorFontSize, setEditorFontSize]);

  return (
    <View>
      {/* Theme card — title + description + chip row, all inside
          one bordered card so the chips read as part of the same
          control. */}
      <View style={styles.appearanceCard}>
        <View style={styles.appearanceCardHeader}>
          <Text style={styles.menuRowText}>Theme</Text>
          <Text style={[styles.toggleInfo, { color: themeColors.muted }]}>
            "System" follows your device's light/dark setting
          </Text>
        </View>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = theme === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setTheme(opt.value)}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: isActive
                      ? `${themeColors.primary}1A`
                      : "transparent",
                    borderColor: isActive
                      ? themeColors.primary
                      : themeColors.border,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={opt.label}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    {
                      color: isActive
                        ? themeColors.primary
                        : themeColors.foreground,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Accent color card — same pattern: header + swatch row
          inside one card. The Teams theme overrides primary with
          its own purple, so dim the swatches and surface a one-line
          hint when active. */}
      <View
        style={[
          styles.appearanceCard,
          theme === "teams" && { opacity: 0.6 },
        ]}
      >
        <View style={styles.appearanceCardHeader}>
          <Text style={styles.menuRowText}>Accent Color</Text>
          <Text style={[styles.toggleInfo, { color: themeColors.muted }]}>
            {theme === "teams"
              ? "Overridden while the Grey theme is active"
              : "Used for the primary action color across the app"}
          </Text>
        </View>
        <View style={styles.swatchRow}>
          {ACCENT_PRESET_KEYS.map((key) => {
            const swatchHex = ACCENT_PRESETS[key][resolvedTheme];
            const isActive = accentColor === key;
            return (
              <Pressable
                key={key}
                onPress={() => setAccentColor(key as AccentColorPreset)}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: swatchHex,
                    borderColor: isActive
                      ? themeColors.foreground
                      : "transparent",
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${key} accent`}
              >
                {isActive ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={16}
                    color={resolvedTheme === "dark" ? "#000" : "#fff"}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Editor font size — stepper */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Text style={styles.menuRowText}>Editor Font Size</Text>
          <Text style={[styles.toggleInfo, { color: themeColors.muted }]}>
            Body-text size inside the note editor
          </Text>
        </View>
        <View style={styles.stepper}>
          <Pressable
            onPress={decFont}
            disabled={editorFontSize <= FONT_SIZE_MIN}
            style={[
              styles.stepperButton,
              {
                borderColor: themeColors.border,
                opacity: editorFontSize <= FONT_SIZE_MIN ? 0.4 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Decrease font size"
          >
            <MaterialCommunityIcons
              name="minus"
              size={16}
              color={themeColors.foreground}
            />
          </Pressable>
          <Text
            style={[styles.stepperValue, { color: themeColors.foreground }]}
          >
            {editorFontSize}
          </Text>
          <Pressable
            onPress={incFont}
            disabled={editorFontSize >= FONT_SIZE_MAX}
            style={[
              styles.stepperButton,
              {
                borderColor: themeColors.border,
                opacity: editorFontSize >= FONT_SIZE_MAX ? 0.4 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Increase font size"
          >
            <MaterialCommunityIcons
              name="plus"
              size={16}
              color={themeColors.foreground}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Dashboard Settings Section ──────────────────────────────────

function DashboardSettingsSection() {
  const themeColors = useThemeColors();
  const styles = makeStyles(themeColors);
  const speedDialEnabled = useDashboardSettingsStore(
    (s) => s.speedDialEnabled,
  );
  const quickActionsEnabled = useDashboardSettingsStore(
    (s) => s.quickActionsEnabled,
  );
  const setSpeedDialEnabled = useDashboardSettingsStore(
    (s) => s.setSpeedDialEnabled,
  );
  const setQuickActionsEnabled = useDashboardSettingsStore(
    (s) => s.setQuickActionsEnabled,
  );

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
          false: themeColors.mutedForeground,
          true: themeColors.primary,
        }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <View>
      {renderToggle(
        "Show Quick Actions",
        quickActionsEnabled,
        setQuickActionsEnabled,
        "Render the New Note and recording shortcuts row at the top of the Dashboard",
      )}
      {renderToggle(
        "Speed-Dial FAB",
        speedDialEnabled,
        setSpeedDialEnabled,
        "Tap the “+” button to expand New Note plus the four recording modes. Off keeps a single “+” FAB that creates a note",
      )}
    </View>
  );
}

// ─── AI Settings Section ─────────────────────────────────────────

function AiSettingsSection() {
  const themeColors = useThemeColors();
  const styles = makeStyles(themeColors);
  const masterAiEnabled = useAiSettingsStore((s) => s.masterAiEnabled);
  const qaAssistant = useAiSettingsStore((s) => s.qaAssistant);
  const summarize = useAiSettingsStore((s) => s.summarize);
  const tagSuggestions = useAiSettingsStore((s) => s.tagSuggestions);
  const audioNotes = useAiSettingsStore((s) => s.audioNotes);
  const imageUploadsWifiOnly = useAiSettingsStore((s) => s.imageUploadsWifiOnly);
  const autoApprove = useAiSettingsStore((s) => s.autoApprove);
  const setMasterAiEnabled = useAiSettingsStore((s) => s.setMasterAiEnabled);
  const setQaAssistant = useAiSettingsStore((s) => s.setQaAssistant);
  const setSummarize = useAiSettingsStore((s) => s.setSummarize);
  const setTagSuggestions = useAiSettingsStore((s) => s.setTagSuggestions);
  const setAudioNotes = useAiSettingsStore((s) => s.setAudioNotes);
  const setImageUploadsWifiOnly = useAiSettingsStore(
    (s) => s.setImageUploadsWifiOnly,
  );
  const setAutoApprove = useAiSettingsStore((s) => s.setAutoApprove);

  // Render a toggle row inside a grouped card. Drops the per-row
  // border/background/marginBottom so multiple rows read as a
  // single card with internal dividers, matching desktop's
  // `SettingsGroup` look. Each row inside a card is divided from
  // the next by a 1px hairline (rendered via `borderTopWidth` on
  // every row except the first).
  const renderGroupedToggle = (
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    info?: string,
    isFirst = false,
  ) => (
    <View
      style={[
        styles.aiGroupRow,
        !isFirst && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: themeColors.border,
        },
      ]}
      key={label}
    >
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
          false: themeColors.mutedForeground,
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
      label: "Move Notes to Trash",
      info: "Auto-approve `delete_note` calls. Notes go to Trash and can be restored until the trash auto-delete timer purges them",
    },
    {
      key: "deleteFolder",
      label: "Delete Folders",
      info: "Auto-approve `delete_folder` calls. Notes inside become Unfiled",
    },
    {
      key: "updateNoteContent",
      label: "Rewrite Note Content",
      info: "Auto-approve `update_note_content` calls. Previous version stays in version history",
    },
    {
      key: "renameNote",
      label: "Rename Notes",
      info: "Auto-approve `rename_note` calls. Updates the note title only; content, folder, tags, etc are unchanged",
    },
    {
      key: "renameFolder",
      label: "Rename Folders",
      info: "Auto-approve `rename_folder` calls",
    },
    {
      key: "renameTag",
      label: "Rename Tags",
      info: "Auto-approve `rename_tag` calls. Affects every note using that tag",
    },
  ];

  return (
    <View>
      {/* Section order mirrors desktop: master gate → Note Analysis
          → Search & Chat (with auto-approve sub-list) → Audio →
          mobile-only Wi-Fi setting. Each card groups conceptually
          related toggles, matching desktop's SettingsGroup layout. */}

      {/* Master gate */}
      <View style={styles.aiGroupCard}>
        {renderGroupedToggle(
          "AI Features",
          masterAiEnabled,
          setMasterAiEnabled,
          "Master toggle for all AI features across the app",
          true,
        )}
      </View>

      {/* Note Analysis */}
      {masterAiEnabled ? (
        <View style={styles.aiGroupCard}>
          {renderGroupedToggle(
            "Summarize",
            summarize,
            setSummarize,
            "Generate a short AI summary of your note",
            true,
          )}
          {renderGroupedToggle(
            "Auto-Tag Suggestions",
            tagSuggestions,
            setTagSuggestions,
            "Generate tags that are relevant to your note",
          )}
        </View>
      ) : null}

      {/* Search & Chat — AI Assistant chat plus the per-tool
          auto-approve sub-card that only shows when the chat is
          enabled. */}
      {masterAiEnabled ? (
        <View style={styles.aiGroupCard}>
          {renderGroupedToggle(
            "AI Assistant Chat",
            qaAssistant,
            setQaAssistant,
            "Ask natural language questions about your notes. Requires semantic search to be enabled",
            true,
          )}
          {showAutoApprove ? (
            <View style={styles.autoApproveBlock}>
              <Text
                style={[
                  styles.autoApproveHeading,
                  { color: themeColors.muted },
                ]}
              >
                Auto-Approve Destructive Actions
              </Text>
              <Text
                style={[
                  styles.autoApproveDescription,
                  { color: themeColors.muted },
                ]}
              >
                When disabled the AI Assistant waits for your confirmation
              </Text>
              {autoApproveLabels.map(({ key, label, info }, i) =>
                renderGroupedToggle(
                  label,
                  autoApprove[key],
                  (v) => setAutoApprove(key, v),
                  info,
                  i === 0,
                ),
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Audio */}
      {masterAiEnabled ? (
        <View style={styles.aiGroupCard}>
          {renderGroupedToggle(
            "Audio Notes",
            audioNotes,
            setAudioNotes,
            "Record audio and transcribe it into a note using the AI Assistant",
            true,
          )}
        </View>
      ) : null}

      {/* Mobile-specific bandwidth setting. Always visible — the
          cellular/wifi distinction matters whether AI is on or off,
          since image uploads happen on the same path. */}
      <View style={styles.aiGroupCard}>
        {renderGroupedToggle(
          "Wi-Fi Only Image Uploads",
          imageUploadsWifiOnly,
          setImageUploadsWifiOnly,
          "Images attached to notes wait for Wi-Fi before uploading",
          true,
        )}
      </View>
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
    menuRowChevron: {
      marginLeft: "auto",
    },
    // Right-aligned value text used by static rows (e.g. Email)
    // alongside the menuRowText label. `flex: 1` claims the
    // remaining row space and `textAlign: "right"` pushes the text
    // to the trailing edge; `numberOfLines={1}` on the consumer
    // truncates rather than wrapping a long email onto a second
    // line and breaking the row's height.
    menuRowValue: {
      flex: 1,
      fontSize: 14,
      textAlign: "right",
    },
    enabledBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.sm,
      marginLeft: "auto",
    },
    enabledBadgeText: {
      fontSize: 11,
      fontWeight: "700",
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
    appearanceCard: {
      backgroundColor: themeColors.card,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      marginBottom: spacing.xs,
      gap: spacing.sm,
    },
    appearanceCardHeader: {
      // Header text + description sit at the top of the card; the
      // active control (chips / swatches) flows below.
    },
    themeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    themeChip: {
      // 4 chips per row on phones wide enough; flex-basis ~ 22%
      // leaves room for the gap. flexGrow 1 lets the last row of
      // wrapped chips fill any remaining space.
      flexBasis: "22%",
      flexGrow: 1,
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      alignItems: "center",
    },
    themeChipText: {
      fontSize: 13,
      fontWeight: "600",
    },
    swatchRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    stepperButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperValue: {
      fontSize: 14,
      fontWeight: "600",
      minWidth: 24,
      textAlign: "center",
    },
    // Wraps a group of related AI toggles into one bordered card,
    // mirroring desktop's `SettingsGroup` look. Inner rows render
    // without their own border/bg — they get a hairline divider
    // from `aiGroupRow` instead.
    aiGroupCard: {
      backgroundColor: themeColors.card,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: borderRadius.md,
      marginBottom: spacing.sm,
      overflow: "hidden",
    },
    aiGroupRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    // Sub-card inside Search & Chat that holds the per-tool
    // auto-approve toggles. Visually nests under the AI Assistant
    // chat row by carrying the surrounding card's background but
    // with a top divider. Horizontal inset is left to children
    // (heading uses its own inset, rows use aiGroupRow's padding)
    // so the row labels align with the AI Assistant chat label.
    autoApproveBlock: {
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: themeColors.border,
    },
    autoApproveHeading: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: spacing.xs,
      letterSpacing: 0.5,
      paddingHorizontal: spacing.md,
    },
    autoApproveDescription: {
      fontSize: 11,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
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
  });
}
