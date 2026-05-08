import React, { useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { useNote } from "@/hooks/useNotes";
import { useVersions, useRestoreVersion } from "@/hooks/useVersions";
import { diffLines, type DiffLine } from "@/lib/diff";
import { useAppAlert } from "@/components/AppAlertProvider";

type Props = NativeStackScreenProps<NotesStackParamList, "NoteDiff">;

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

export function NoteDiffScreen({ route, navigation }: Props) {
  const { noteId, versionId } = route.params;
  const themeColors = useThemeColors();
  const showAlert = useAppAlert();

  const { data: note, isLoading: isLoadingNote } = useNote(noteId);
  const { data: versionsData, isLoading: isLoadingVersions } = useVersions(noteId);
  const restoreVersion = useRestoreVersion();

  const version = useMemo(
    () => versionsData?.versions.find((v) => v.id === versionId),
    [versionsData, versionId],
  );

  const titleDiff = useMemo<DiffLine[] | null>(() => {
    if (!version || !note) return null;
    if (version.title === note.title) return null;
    return diffLines(version.title, note.title);
  }, [version, note]);

  const contentDiff = useMemo<DiffLine[] | null>(() => {
    if (!version || !note) return null;
    return diffLines(version.content, note.content);
  }, [version, note]);

  const handleRestore = useCallback(() => {
    if (!version) return;
    showAlert(
      "Restore Version",
      "This will replace the current content with this version. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            await restoreVersion.mutateAsync({ noteId, versionId });
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            navigation.goBack();
          },
        },
      ],
    );
  }, [version, noteId, versionId, restoreVersion, navigation, showAlert]);

  // Title in the navigation header. Falls back to "Diff" while
  // version data is still loading.
  useEffect(() => {
    navigation.setOptions({
      title: version ? "Compare Version" : "Diff",
    });
  }, [navigation, version]);

  if (isLoadingNote || isLoadingVersions) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator
          size="large"
          color={themeColors.primary}
          style={styles.loader}
        />
      </View>
    );
  }

  if (!version || !note) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Text style={[styles.emptyText, { color: themeColors.muted }]}>
          Version not found.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header bar: timestamp + origin */}
      <View
        style={[
          styles.header,
          { borderBottomColor: themeColors.border },
        ]}
      >
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTimestamp, { color: themeColors.foreground }]}>
            {formatFullDate(version.createdAt)}
          </Text>
          <Text style={[styles.headerOrigin, { color: themeColors.muted }]}>
            {version.origin}
          </Text>
        </View>
      </View>

      {/* Diff body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {titleDiff ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.muted }]}>
              Title changed
            </Text>
            <View
              style={[
                styles.diffBlock,
                { backgroundColor: themeColors.card, borderColor: themeColors.border },
              ]}
            >
              {titleDiff.map((line, i) => (
                <DiffRow key={`t-${i}`} line={line} themeColors={themeColors} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: themeColors.muted }]}>
            Content
          </Text>
          {contentDiff && contentDiff.length > 0 ? (
            <View
              style={[
                styles.diffBlock,
                { backgroundColor: themeColors.card, borderColor: themeColors.border },
              ]}
            >
              {contentDiff.map((line, i) => (
                <DiffRow key={`c-${i}`} line={line} themeColors={themeColors} />
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: themeColors.muted }]}>
              No content differences.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View
        style={[
          styles.actionBar,
          { borderTopColor: themeColors.border, backgroundColor: themeColors.background },
        ]}
      >
        <Pressable
          style={[
            styles.actionButton,
            styles.actionSecondary,
            { borderColor: themeColors.border },
          ]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close diff"
        >
          <Text style={[styles.actionTextSecondary, { color: themeColors.foreground }]}>
            Close
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.actionButton,
            styles.actionPrimary,
            { backgroundColor: themeColors.primary },
          ]}
          onPress={handleRestore}
          disabled={restoreVersion.isPending}
          accessibilityRole="button"
          accessibilityLabel="Restore this version"
        >
          {restoreVersion.isPending ? (
            <ActivityIndicator size="small" color={themeColors.background} />
          ) : (
            <>
              <MaterialCommunityIcons
                name="restore"
                size={18}
                color={themeColors.background}
              />
              <Text style={[styles.actionTextPrimary, { color: themeColors.background }]}>
                Restore This Version
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function DiffRow({
  line,
  themeColors,
}: {
  line: DiffLine;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const isAdded = line.type === "added";
  const isRemoved = line.type === "removed";

  // Tints picked to match web/desktop's `bg-green-900/30` and
  // `bg-red-900/30` row backgrounds. Foreground colors use the
  // brighter green-400 / red-400 from the same palette.
  const bg = isAdded
    ? "rgba(34, 197, 94, 0.15)"
    : isRemoved
      ? "rgba(239, 68, 68, 0.15)"
      : "transparent";
  const fg = isAdded
    ? "#4ade80"
    : isRemoved
      ? "#f87171"
      : themeColors.muted;
  const prefix = isAdded ? "+" : isRemoved ? "-" : " ";
  const displayText = line.text.length > 0 ? line.text : " ";

  return (
    <View style={[styles.row, { backgroundColor: bg }]}>
      <Text style={[styles.rowText, { color: fg }]} selectable>
        {prefix} {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerInfo: {
    flex: 1,
  },
  headerTimestamp: {
    fontSize: 14,
    fontWeight: "600",
  },
  headerOrigin: {
    fontSize: 12,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  diffBlock: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  rowText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
  },
  actionBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  actionSecondary: {
    borderWidth: 1,
  },
  actionPrimary: {
    // bg color applied inline via theme
  },
  actionTextSecondary: {
    fontSize: 14,
    fontWeight: "600",
  },
  actionTextPrimary: {
    fontSize: 14,
    fontWeight: "700",
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.lg,
    fontStyle: "italic",
  },
});
