import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { Note } from "@derekentringer/ns-shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { DashboardStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";
import { useDashboard } from "@/hooks/useNotes";
import { DashboardNoteCard } from "@/components/notes/DashboardNoteCard";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { EmptyState } from "@/components/common/EmptyState";

type Props = NativeStackScreenProps<DashboardStackParamList, "DashboardHome">;

export function DashboardScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();

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

  const renderNoteCard = useCallback(
    ({ item }: { item: Note }) => (
      <DashboardNoteCard note={item} onPress={handleNotePress} />
    ),
    [handleNotePress],
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
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
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
          <FlatList
            data={favorites}
            keyExtractor={(item) => item.id}
            renderItem={renderNoteCard}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          />
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
          <FlatList
            data={recentlyEdited}
            keyExtractor={(item) => item.id}
            renderItem={renderNoteCard}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
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
  horizontalList: {
    paddingHorizontal: spacing.md,
  },
});
