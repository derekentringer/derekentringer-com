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

type Props = NativeStackScreenProps<DashboardStackParamList, "DashboardHome">;

export function DashboardScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();
  const { data: foldersData } = useFolders();
  const folders = foldersData?.folders ?? [];

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
  const isEmpty = favorites.length === 0 && recentlyEdited.length === 0;

  if (isEmpty) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <EmptyState message="No notes yet. Create your first note to get started!" />
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

        {/* Recently Edited section */}
        {recentlyEdited.length > 0 ? (
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: themeColors.foreground }]}
            >
              Recently Edited
            </Text>
            <View style={styles.tileGrid}>
              {recentlyEdited.map((note) => (
                <View key={note.id} style={styles.tileCell}>
                  <DashboardNoteCard
                    note={note}
                    onPress={handleNotePress}
                    compact
                    folderName={resolveFolderName(note)}
                  />
                </View>
              ))}
              {recentlyEdited.length % 2 !== 0 ? (
                <View style={styles.tileCell} />
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

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
});
