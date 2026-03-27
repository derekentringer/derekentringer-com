import React, { useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Note } from "@derekentringer/ns-shared";
import type { SettingsStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import {
  useTrash,
  useRestoreNote,
  usePermanentDeleteNote,
  useEmptyTrash,
} from "@/hooks/useTrash";
import { useFolders } from "@/hooks/useFolders";
import { findFolderName } from "@/lib/folders";
import { TrashNoteItem } from "@/components/notes/TrashNoteItem";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorCard } from "@/components/common/ErrorCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";

type Props = NativeStackScreenProps<SettingsStackParamList, "Trash">;

export function TrashScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTrash();
  const { data: foldersData } = useFolders();
  const restoreNote = useRestoreNote();
  const permanentDelete = usePermanentDeleteNote();
  const emptyTrashMutation = useEmptyTrash();

  const notes = useMemo(
    () => data?.pages.flatMap((p) => p.notes) ?? [],
    [data],
  );

  const handleRestore = useCallback(
    (noteId: string) => {
      restoreNote.mutate(
        { id: noteId },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      );
    },
    [restoreNote],
  );

  const handlePermanentDelete = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      Alert.alert(
        "Delete Permanently",
        `"${note?.title || "Untitled"}" will be permanently deleted. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              permanentDelete.mutate(
                { id: noteId },
                {
                  onSuccess: () => {
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                  },
                },
              );
            },
          },
        ],
      );
    },
    [permanentDelete, notes],
  );

  const handleEmptyTrash = useCallback(() => {
    Alert.alert(
      "Empty Trash",
      `Permanently delete all ${notes.length} trashed notes? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty Trash",
          style: "destructive",
          onPress: () => {
            emptyTrashMutation.mutate(undefined, {
              onSuccess: () => {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              },
            });
          },
        },
      ],
    );
  }, [emptyTrashMutation, notes.length]);

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handlePress = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        navigation.navigate("TrashNoteDetail", { note });
      }
    },
    [navigation, notes],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Set header with Empty Trash button
  React.useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        notes.length > 0 ? (
          <View style={styles.headerButton}>
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={22}
              color={themeColors.destructive}
              onPress={handleEmptyTrash}
              accessibilityRole="button"
              accessibilityLabel="Empty trash"
            />
          </View>
        ) : null,
    });
  }, [navigation, notes.length, themeColors, handleEmptyTrash]);

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const folderName = findFolderName(
        foldersData?.folders ?? [],
        item.folderId,
      );
      return (
        <TrashNoteItem
          note={item}
          folderName={folderName}
          onPress={handlePress}
          onRestore={handleRestore}
          onPermanentDelete={handlePermanentDelete}
        />
      );
    },
    [foldersData, handlePress, handleRestore, handlePermanentDelete],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} style={{ marginTop: spacing.sm }} />
          <SkeletonCard lines={2} style={{ marginTop: spacing.sm }} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ErrorCard message="Failed to load trash" onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          notes.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={<EmptyState message="Trash is empty" />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={themeColors.primary}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator
              style={styles.footer}
              color={themeColors.primary}
            />
          ) : null
        }
      />
    </View>
  );
}

// Import here to use in header
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: spacing.md,
  },
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  emptyContainer: {
    flex: 1,
  },
  headerButton: {
    padding: spacing.xs,
  },
  footer: {
    paddingVertical: spacing.md,
  },
});
