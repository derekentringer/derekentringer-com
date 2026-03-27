import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { formatCreatedDate, formatModifiedDate } from "@/lib/time";
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
import { useFolders } from "@/hooks/useFolders";
import { findFolderName } from "@/lib/folders";

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
  const { data: foldersData } = useFolders();

  const resolvedFolderName =
    findFolderName(foldersData?.folders ?? [], note?.folderId) || note?.folder || null;

  const deleteNote = useDeleteNote();
  const toggleFavorite = useToggleFavorite();
  const restoreVersion = useRestoreVersion();

  const versionSheetRef = useRef<BottomSheetModal>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  // Refetch when screen regains focus (e.g. returning from editor)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

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

  const handleCopyLink = useCallback(async () => {
    const url = `https://ns.derekentringer.com/notes/${noteId}`;
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [noteId]);

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

  // Header actions
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate("NoteEditor", { noteId })}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Edit note"
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={22}
              color={themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={handleToggleFavorite}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={note?.favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <MaterialCommunityIcons
              name={note?.favorite ? "star" : "star-outline"}
              size={22}
              color={note?.favorite ? themeColors.primary : themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={handleCopyLink}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Copy link"
          >
            <MaterialCommunityIcons
              name="link-variant"
              size={22}
              color={themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={() => setShowOverflow((p) => !p)}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MaterialCommunityIcons
              name="dots-vertical"
              size={22}
              color={themeColors.foreground}
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, noteId, note?.favorite, themeColors, handleToggleFavorite, handleCopyLink]);

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
        {/* Status line */}
        <Text style={[styles.statusLine, { color: themeColors.muted }]}>
          Saved · Created {formatCreatedDate(note.createdAt)} · Modified {formatModifiedDate(note.updatedAt)}
        </Text>

        {/* Title */}
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          {note.title || "Untitled"}
        </Text>

        {/* Folder */}
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
            {resolvedFolderName || "No folder"}
          </Text>
        </View>

        {/* Tags */}
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

      {/* Overflow menu */}
      {showOverflow ? (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View style={[styles.overflowMenu, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                versionSheetRef.current?.present();
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="history" size={20} color={themeColors.foreground} />
              <Text style={[styles.overflowText, { color: themeColors.foreground }]}>
                Version History
              </Text>
            </Pressable>
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                handleDelete();
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={themeColors.destructive} />
              <Text style={[styles.overflowText, { color: themeColors.destructive }]}>
                Delete Note
              </Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerButton: {
    padding: spacing.xs,
  },
  statusLine: {
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  overflowMenu: {
    position: "absolute",
    top: 4,
    right: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 4,
    minWidth: 180,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 11,
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
  },
  overflowText: {
    fontSize: 15,
  },
  folderBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    marginBottom: spacing.xs,
  },
  folderText: {
    fontSize: 12,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.md,
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
