import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Share,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Markdown from "react-native-markdown-display";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { relativeTime } from "@/lib/time";
import {
  useNote,
  useDeleteNote,
  useToggleFavorite,
} from "@/hooks/useNotes";
import { useBacklinks } from "@/hooks/useBacklinks";
import { useVersions, useRestoreVersion } from "@/hooks/useVersions";
import { BacklinksSection } from "@/components/notes/BacklinksSection";
import { VersionHistorySheet } from "@/components/notes/VersionHistorySheet";
import { ErrorCard } from "@/components/common/ErrorCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";

type Props = NativeStackScreenProps<NotesStackParamList, "NoteDetail">;

export function NoteDetailScreen({ route, navigation }: Props) {
  const { noteId } = route.params;
  const themeColors = useThemeColors();

  const { data: note, isLoading, isError, refetch, isRefetching } = useNote(noteId);
  const { data: backlinksData } = useBacklinks(noteId);
  const {
    data: versionsData,
    isLoading: isLoadingVersions,
  } = useVersions(noteId);

  const deleteNote = useDeleteNote();
  const toggleFavorite = useToggleFavorite();
  const restoreVersion = useRestoreVersion();

  const versionSheetRef = useRef<BottomSheetModal>(null);

  const handleToggleFavorite = useCallback(async () => {
    if (!note) return;
    await toggleFavorite.mutateAsync({
      id: note.id,
      favorite: !note.favorite,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [note, toggleFavorite]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Note",
      "Are you sure you want to delete this note?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteNote.mutateAsync({ id: noteId });
            navigation.goBack();
          },
        },
      ],
    );
  }, [noteId, deleteNote, navigation]);

  const handleShare = useCallback(async () => {
    if (!note) return;
    await Share.share({
      title: note.title,
      message: `${note.title}\n\n${note.content}`,
    });
  }, [note]);

  const handleRefresh = useCallback(async () => {
    await refetch();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [refetch]);

  const handleBacklinkPress = useCallback(
    (backlinkNoteId: string) => {
      navigation.push("NoteDetail", { noteId: backlinkNoteId });
    },
    [navigation],
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      await restoreVersion.mutateAsync({ noteId, versionId });
      versionSheetRef.current?.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [noteId, restoreVersion],
  );

  const mdStyles = React.useMemo(
    () => ({
      body: { color: themeColors.foreground, fontSize: 15, lineHeight: 22 },
      heading1: {
        color: themeColors.foreground,
        fontSize: 24,
        fontWeight: "700" as const,
        marginBottom: 8,
      },
      heading2: {
        color: themeColors.foreground,
        fontSize: 20,
        fontWeight: "600" as const,
        marginBottom: 6,
      },
      heading3: {
        color: themeColors.foreground,
        fontSize: 17,
        fontWeight: "600" as const,
        marginBottom: 4,
      },
      code_inline: {
        backgroundColor: themeColors.card,
        color: themeColors.primary,
        borderRadius: 4,
        paddingHorizontal: 4,
      },
      code_block: {
        backgroundColor: themeColors.card,
        borderRadius: 8,
        padding: 12,
        color: themeColors.foreground,
      },
      fence: {
        backgroundColor: themeColors.card,
        borderRadius: 8,
        padding: 12,
        color: themeColors.foreground,
      },
      blockquote: {
        backgroundColor: themeColors.card,
        borderLeftWidth: 3,
        borderLeftColor: themeColors.primary,
        paddingHorizontal: 12,
        paddingVertical: 4,
      },
      link: { color: themeColors.primary },
      hr: { backgroundColor: themeColors.border },
    }),
    [themeColors],
  );

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <View style={styles.loadingContainer}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} style={{ marginTop: spacing.md }} />
        </View>
      </View>
    );
  }

  if (isError || !note) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <ErrorCard
          message="Failed to load note"
          onRetry={() => refetch()}
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            {note.title || "Untitled"}
          </Text>

          {/* Action row */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleToggleFavorite}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel={
                note.favorite ? "Remove from favorites" : "Add to favorites"
              }
            >
              <MaterialCommunityIcons
                name={note.favorite ? "star" : "star-outline"}
                size={22}
                color={
                  note.favorite ? themeColors.primary : themeColors.muted
                }
              />
            </Pressable>

            <Pressable
              onPress={handleShare}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel="Share note"
            >
              <MaterialCommunityIcons
                name="share-variant-outline"
                size={20}
                color={themeColors.muted}
              />
            </Pressable>

            <Pressable
              onPress={() => versionSheetRef.current?.present()}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel="Version history"
            >
              <MaterialCommunityIcons
                name="history"
                size={20}
                color={themeColors.muted}
              />
            </Pressable>

            <Pressable
              onPress={handleDelete}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={20}
                color={themeColors.destructive}
              />
            </Pressable>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.meta}>
          {note.folder ? (
            <View
              style={[
                styles.folderBadge,
                { backgroundColor: themeColors.border },
              ]}
            >
              <MaterialCommunityIcons
                name="folder-outline"
                size={12}
                color={themeColors.muted}
              />
              <Text style={[styles.folderText, { color: themeColors.muted }]}>
                {note.folder}
              </Text>
            </View>
          ) : null}

          {note.tags.length > 0 ? (
            <View style={styles.tags}>
              {note.tags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagChip,
                    { backgroundColor: `${themeColors.primary}1A` },
                  ]}
                >
                  <Text
                    style={[styles.tagText, { color: themeColors.primary }]}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={[styles.dateText, { color: themeColors.muted }]}>
            Created {relativeTime(note.createdAt)} · Updated{" "}
            {relativeTime(note.updatedAt)}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {note.content ? (
            <Markdown style={mdStyles}>{note.content}</Markdown>
          ) : (
            <Text style={[styles.emptyContent, { color: themeColors.muted }]}>
              No content
            </Text>
          )}
        </View>

        {/* Backlinks */}
        {backlinksData?.backlinks ? (
          <View style={styles.backlinks}>
            <BacklinksSection
              backlinks={backlinksData.backlinks}
              onPress={handleBacklinkPress}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Version history sheet */}
      <VersionHistorySheet
        bottomSheetRef={versionSheetRef}
        versions={versionsData?.versions ?? []}
        isLoading={isLoadingVersions}
        onRestore={handleRestoreVersion}
        isRestoring={restoreVersion.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: spacing.md,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionButton: {
    padding: spacing.xs,
  },
  meta: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  folderBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  folderText: {
    fontSize: 12,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dateText: {
    fontSize: 12,
    marginTop: 4,
  },
  content: {
    minHeight: 200,
  },
  emptyContent: {
    fontSize: 15,
    fontStyle: "italic",
  },
  backlinks: {
    paddingHorizontal: 0,
  },
});
