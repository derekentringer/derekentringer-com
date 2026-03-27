import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Markdown from "react-native-markdown-display";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { formatCreatedDate, formatModifiedDate } from "@/lib/time";
import { useRestoreNote, usePermanentDeleteNote } from "@/hooks/useTrash";
import { useFolders } from "@/hooks/useFolders";
import { findFolderName } from "@/lib/folders";

type Props = NativeStackScreenProps<SettingsStackParamList, "TrashNoteDetail">;

export function TrashNoteDetailScreen({ route, navigation }: Props) {
  const { note } = route.params;
  const themeColors = useThemeColors();

  const { data: foldersData } = useFolders();
  const restoreNote = useRestoreNote();
  const permanentDelete = usePermanentDeleteNote();

  const resolvedFolderName =
    findFolderName(foldersData?.folders ?? [], note.folderId) || note.folder || null;

  const handleRestore = useCallback(async () => {
    await restoreNote.mutateAsync({ id: note.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  }, [note.id, restoreNote, navigation]);

  const handlePermanentDelete = useCallback(() => {
    Alert.alert(
      "Delete Permanently",
      `"${note.title || "Untitled"}" will be permanently deleted. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await permanentDelete.mutateAsync({ id: note.id });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.goBack();
          },
        },
      ],
    );
  }, [note.id, note.title, permanentDelete, navigation]);

  // Header actions
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable
            onPress={handleRestore}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Restore note"
          >
            <MaterialCommunityIcons
              name="restore"
              size={22}
              color={themeColors.success}
            />
          </Pressable>
          <Pressable
            onPress={handlePermanentDelete}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Permanently delete note"
          >
            <MaterialCommunityIcons
              name="delete-forever"
              size={22}
              color={themeColors.destructive}
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, themeColors, handleRestore, handlePermanentDelete]);

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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Deleted status line */}
        <View style={[styles.deletedBanner, { backgroundColor: `${themeColors.destructive}1A` }]}>
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={14}
            color={themeColors.destructive}
          />
          <Text style={[styles.deletedBannerText, { color: themeColors.destructive }]}>
            Deleted on {note.deletedAt ? formatCreatedDate(note.deletedAt) : "unknown"}
          </Text>
        </View>

        {/* Status line */}
        <Text style={[styles.statusLine, { color: themeColors.muted }]}>
          Created {formatCreatedDate(note.createdAt)} · Modified {formatModifiedDate(note.updatedAt)}
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
                <Text style={[styles.tagText, { color: themeColors.primary }]}>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  deletedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  deletedBannerText: {
    fontSize: 12,
    fontWeight: "500",
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
    marginTop: spacing.md,
    minHeight: 200,
  },
  emptyContent: {
    fontSize: 15,
    fontStyle: "italic",
  },
});
