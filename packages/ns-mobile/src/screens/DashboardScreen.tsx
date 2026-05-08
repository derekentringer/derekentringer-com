import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type { Note } from "@derekentringer/ns-shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { DashboardStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import { useDashboard } from "@/hooks/useNotes";
import { useFolders } from "@/hooks/useFolders";
import { findFolderName } from "@/lib/folders";
import { DashboardNoteCard } from "@/components/notes/DashboardNoteCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";
import {
  SpeedDialFab,
  type SpeedDialAction,
} from "@/components/SpeedDialFab";
import useAiSettingsStore from "@/store/aiSettingsStore";
import useDashboardSettingsStore from "@/store/dashboardSettingsStore";
import type { AudioMode } from "@/api/ai";

type Props = NativeStackScreenProps<DashboardStackParamList, "DashboardHome">;

/** Single Quick Action tile — square card with an icon + label.
 *  Mirrors the geometry of web/desktop's `bg-card rounded-md
 *  border p-4 min-w-[100px]` quick-action button so the layout
 *  reads consistently across platforms. */
function QuickActionTile({
  icon,
  label,
  onPress,
  themeColors,
  width,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  onPress: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
  width: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        quickActionStyles.tile,
        {
          width,
          backgroundColor: themeColors.card,
          borderColor: pressed ? `${themeColors.primary}80` : themeColors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={20} color={themeColors.primary} />
      <Text
        style={[quickActionStyles.label, { color: themeColors.foreground }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const QUICK_ACTIONS_GAP = 6;
const QUICK_ACTIONS_MAX_TILES = 5;
// Minimum tile width that keeps the longest label ("Verbatim") legible
// at 10px font without truncation. Below this width the row wraps to
// a second line rather than squeezing the labels.
const QUICK_ACTIONS_MIN_TILE_WIDTH = 64;

const quickActionStyles = StyleSheet.create({
  // Each tile renders at a fixed width sized so MAX_TILES fit on a
  // single row across the screen width. Fewer tiles stay
  // left-justified at the same width rather than stretching.
  tile: {
    minHeight: 64,
    paddingHorizontal: 4,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
  },
});

export function DashboardScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();
  const { data: foldersData } = useFolders();
  const folders = foldersData?.folders ?? [];
  const masterAiEnabled = useAiSettingsStore((s) => s.masterAiEnabled);
  const audioNotesEnabled = useAiSettingsStore((s) => s.audioNotes);
  // Recording shortcuts only show when both the master AI gate and
  // the Audio Notes setting are on. Mirrors web/desktop's
  // `audioNotesEnabled = masterAiEnabled && settings.audioNotes`.
  const recordingShortcutsEnabled = masterAiEnabled && audioNotesEnabled;
  const speedDialEnabled = useDashboardSettingsStore(
    (s) => s.speedDialEnabled,
  );
  const quickActionsEnabled = useDashboardSettingsStore(
    (s) => s.quickActionsEnabled,
  );
  // Fixed per-tile width sized so MAX_TILES fit on the row at the
  // current screen width, but never below MIN_TILE_WIDTH so labels
  // stay legible. On very narrow phones the row wraps to a second
  // line via flexWrap rather than squeezing labels into ellipses.
  const quickActionTileWidth = Math.max(
    QUICK_ACTIONS_MIN_TILE_WIDTH,
    (screenWidth -
      spacing.md * 2 -
      QUICK_ACTIONS_GAP * (QUICK_ACTIONS_MAX_TILES - 1)) /
      QUICK_ACTIONS_MAX_TILES,
  );

  const resolveFolderName = useCallback(
    (note: Note) =>
      findFolderName(folders, note.folderId) || note.folder || undefined,
    [folders],
  );

  const handleRefresh = useCallback(async () => {
    await refetch();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [refetch]);

  const handleNotePress = useCallback(
    (noteId: string) => {
      navigation.navigate("NoteDetail", { noteId });
    },
    [navigation],
  );

  const handleNewNote = useCallback(() => {
    navigation.navigate("NoteEditor", {});
  }, [navigation]);

  const handleStartRecording = useCallback(
    (mode: AudioMode) => {
      navigation.navigate("Recording", { mode });
    },
    [navigation],
  );

  // Speed-dial mini-actions. The user-facing rule:
  //   • speed-dial ON + recordings enabled → expand into New Note +
  //     four recording modes when the "+" FAB is tapped
  //   • speed-dial OFF, OR recordings disabled → single "+" FAB
  //     that runs New Note directly (no expansion ceremony for one
  //     entry)
  const speedDialActions: SpeedDialAction[] =
    speedDialEnabled && recordingShortcutsEnabled
      ? [
          {
            key: "newNote",
            label: "New Note",
            icon: "plus",
            onPress: handleNewNote,
          },
          {
            key: "meeting",
            label: "Meeting",
            icon: "account-group-outline",
            onPress: () => handleStartRecording("meeting"),
          },
          {
            key: "lecture",
            label: "Lecture",
            icon: "school-outline",
            onPress: () => handleStartRecording("lecture"),
          },
          {
            key: "memo",
            label: "Memo",
            icon: "microphone-outline",
            onPress: () => handleStartRecording("memo"),
          },
          {
            key: "verbatim",
            label: "Verbatim",
            icon: "format-quote-close",
            onPress: () => handleStartRecording("verbatim"),
          },
        ]
      : [];

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <View style={styles.section}>
          <SkeletonCard lines={1} />
        </View>
        <View style={styles.section}>
          <SkeletonCard lines={2} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <ErrorCard message="Failed to load dashboard" onRetry={() => refetch()} />
      </View>
    );
  }

  const favorites = data?.favorites ?? [];
  const recentlyEdited = data?.recentlyEdited ?? [];
  // Mirrors web/desktop: the most recently edited note becomes the
  // "Resume Editing" hero card; the rest fill the Recently Edited
  // tile grid below. Empty array means no hero — section hides.
  const resumeNote = recentlyEdited[0] ?? null;
  const remainingRecent = recentlyEdited.slice(1);
  const isEmpty = favorites.length === 0 && recentlyEdited.length === 0;

  if (isEmpty) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <EmptyState message="No notes yet. Create your first note to get started!" />
        <SpeedDialFab
          primary={{ label: "New Note", icon: "plus", onPress: handleNewNote }}
          actions={speedDialActions}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={themeColors.primary}
          />
        }
      >
        {/* Quick Actions — mirrors web/desktop's dashboard tiles.
            New Note always shows; Meeting / Lecture / Memo /
            Verbatim only when Audio Notes is on. Hidden when the
            user turns the section off in Settings. */}
        {quickActionsEnabled ? (
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: themeColors.foreground }]}
            >
              Quick Actions
            </Text>
            <View style={styles.quickActionsRow}>
              <QuickActionTile
                icon="plus"
                label="New Note"
                onPress={handleNewNote}
                themeColors={themeColors}
                width={quickActionTileWidth}
              />
              {recordingShortcutsEnabled ? (
                <>
                  <QuickActionTile
                    icon="account-group-outline"
                    label="Meeting"
                    onPress={() => handleStartRecording("meeting")}
                    themeColors={themeColors}
                    width={quickActionTileWidth}
                  />
                  <QuickActionTile
                    icon="school-outline"
                    label="Lecture"
                    onPress={() => handleStartRecording("lecture")}
                    themeColors={themeColors}
                    width={quickActionTileWidth}
                  />
                  <QuickActionTile
                    icon="microphone-outline"
                    label="Memo"
                    onPress={() => handleStartRecording("memo")}
                    themeColors={themeColors}
                    width={quickActionTileWidth}
                  />
                  <QuickActionTile
                    icon="format-quote-close"
                    label="Verbatim"
                    onPress={() => handleStartRecording("verbatim")}
                    themeColors={themeColors}
                    width={quickActionTileWidth}
                  />
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Resume Editing hero card — same shape as web/desktop's
            top-of-dashboard "Resume Editing" section. Surfaces the
            single most recently edited note above Favorites so it's
            one tap to pick up where you left off. */}
        {resumeNote ? (
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: themeColors.foreground }]}
            >
              Resume Editing
            </Text>
            <View style={styles.heroWrap}>
              <DashboardNoteCard
                note={resumeNote}
                onPress={handleNotePress}
                variant="hero"
                folderName={resolveFolderName(resumeNote)}
              />
            </View>
          </View>
        ) : null}

        {/* Favorites section */}
        {favorites.length > 0 ? (
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: themeColors.foreground }]}
            >
              Favorites
            </Text>
            <View style={styles.tileGrid}>
              {favorites.map((note) => (
                <View key={note.id} style={styles.tileCell}>
                  <DashboardNoteCard
                    note={note}
                    onPress={handleNotePress}
                    compact
                    folderName={resolveFolderName(note)}
                  />
                </View>
              ))}
              {favorites.length % 2 !== 0 ? (
                <View style={styles.tileCell} />
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Recently Edited — skip the hero (it's surfaced above as
            "Resume Editing") so it doesn't appear twice. */}
        {remainingRecent.length > 0 ? (
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: themeColors.foreground }]}
            >
              Recently Edited
            </Text>
            <View style={styles.tileGrid}>
              {remainingRecent.map((note) => (
                <View key={note.id} style={styles.tileCell}>
                  <DashboardNoteCard
                    note={note}
                    onPress={handleNotePress}
                    compact
                    folderName={resolveFolderName(note)}
                  />
                </View>
              ))}
              {remainingRecent.length % 2 !== 0 ? (
                <View style={styles.tileCell} />
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Single FAB. When the user has speed-dial turned on AND has
          recording features available, tapping the "+" expands a
          mini-FAB column with New Note + the four recording modes
          (Material 3 speed-dial pattern). Otherwise the FAB is a
          plain "+" that creates a new note directly. */}
      <SpeedDialFab
        primary={{ label: "New Note", icon: "plus", onPress: handleNewNote }}
        actions={speedDialActions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl + 56,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  heroWrap: {
    paddingHorizontal: spacing.md,
  },
  // Each tile renders at a fixed width sized for 5 tiles to fit
  // edge-to-edge; fewer tiles stay left-justified. On screens too
  // narrow to fit 5 at the legible minimum, the row wraps so labels
  // stay readable rather than squeezing onto a single line.
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: QUICK_ACTIONS_GAP,
    paddingHorizontal: spacing.md,
  },
  tileCell: {
    width: "48%",
    flexGrow: 1,
  },
  fab: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabSecondary: {
    right: spacing.md + 56 + spacing.sm,
    borderWidth: 1,
  },
});
