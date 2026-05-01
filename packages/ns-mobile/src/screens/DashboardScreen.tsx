import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
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
import useAiSettingsStore from "@/store/aiSettingsStore";
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
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  onPress: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        quickActionStyles.tile,
        {
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

const quickActionStyles = StyleSheet.create({
  // 5 tiles on a single row on phones as narrow as ~360dp — each
  // tile flex-1 splits the available width evenly. No minWidth so
  // they don't push past the edge; minHeight keeps the icon/label
  // pair vertically centered when the column is squeezed.
  tile: {
    flex: 1,
    minWidth: 0,
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
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();
  const { data: foldersData } = useFolders();
  const folders = foldersData?.folders ?? [];
  const masterAiEnabled = useAiSettingsStore((s) => s.masterAiEnabled);
  const audioNotesEnabled = useAiSettingsStore((s) => s.audioNotes);
  // Recording shortcuts only show when both the master AI gate and
  // the Audio Notes setting are on. Mirrors web/desktop's
  // `audioNotesEnabled = masterAiEnabled && settings.audioNotes`.
  const recordingShortcutsEnabled = masterAiEnabled && audioNotesEnabled;

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
        <Pressable
          style={[
            styles.fab,
            styles.fabSecondary,
            { backgroundColor: themeColors.card, borderColor: themeColors.border },
          ]}
          onPress={() => navigation.navigate("Recording")}
          accessibilityRole="button"
          accessibilityLabel="Start recording"
        >
          <MaterialCommunityIcons
            name="microphone"
            size={26}
            color={themeColors.foreground}
          />
        </Pressable>
        <Pressable
          style={[styles.fab, { backgroundColor: themeColors.primary }]}
          onPress={() => navigation.navigate("NoteEditor", {})}
          accessibilityRole="button"
          accessibilityLabel="Create new note"
        >
          <MaterialCommunityIcons name="plus" size={28} color="#000" />
        </Pressable>
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
            Verbatim only when Audio Notes is on. The whole row
            collapses if AI features are off and there's nothing
            useful to surface (just New Note remains). */}
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
            />
            {recordingShortcutsEnabled ? (
              <>
                <QuickActionTile
                  icon="account-group-outline"
                  label="Meeting"
                  onPress={() => handleStartRecording("meeting")}
                  themeColors={themeColors}
                />
                <QuickActionTile
                  icon="school-outline"
                  label="Lecture"
                  onPress={() => handleStartRecording("lecture")}
                  themeColors={themeColors}
                />
                <QuickActionTile
                  icon="microphone-outline"
                  label="Memo"
                  onPress={() => handleStartRecording("memo")}
                  themeColors={themeColors}
                />
                <QuickActionTile
                  icon="format-quote-close"
                  label="Verbatim"
                  onPress={() => handleStartRecording("verbatim")}
                  themeColors={themeColors}
                />
              </>
            ) : null}
          </View>
        </View>

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

      {/* Recording FAB — secondary, sits to the left of the
          primary "new note" FAB so the most-frequent action stays
          in the canonical bottom-right slot. */}
      <Pressable
        style={[
          styles.fab,
          styles.fabSecondary,
          { backgroundColor: themeColors.card, borderColor: themeColors.border },
        ]}
        onPress={() => navigation.navigate("Recording")}
        accessibilityRole="button"
        accessibilityLabel="Start recording"
      >
        <MaterialCommunityIcons
          name="microphone"
          size={26}
          color={themeColors.foreground}
        />
      </Pressable>

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: themeColors.primary }]}
        onPress={() => navigation.navigate("NoteEditor", {})}
        accessibilityRole="button"
        accessibilityLabel="Create new note"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#000" />
      </Pressable>
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
  // Single-row layout: each tile is `flex: 1` so 5 tiles share the
  // available width evenly on every phone size. No flex-wrap — we
  // want the row to never break onto a second line.
  quickActionsRow: {
    flexDirection: "row",
    gap: 6,
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
