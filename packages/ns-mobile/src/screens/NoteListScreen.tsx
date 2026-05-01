import React, { useState, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import {
  View,
  TextInput,
  FlatList,
  RefreshControl,
  Pressable,
  Text,
  StyleSheet,
} from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Note, NoteSortField, SortOrder } from "@derekentringer/ns-shared";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { useNotes, useToggleFavorite } from "@/hooks/useNotes";
import { manualSync } from "@/lib/syncEngine";
import { useFolders } from "@/hooks/useFolders";
import { useTags } from "@/hooks/useTags";
import { NoteListItem } from "@/components/notes/NoteListItem";
import { FolderPicker } from "@/components/notes/FolderPicker";
import { TagPicker } from "@/components/notes/TagPicker";
import { SortPicker } from "@/components/notes/SortPicker";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorCard } from "@/components/common/ErrorCard";

type Props = NativeStackScreenProps<NotesStackParamList, "NotesList">;

export function NoteListScreen({ navigation }: Props) {
  const themeColors = useThemeColors();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<NoteSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folderSheetRef = useRef<BottomSheetModal>(null);
  const tagSheetRef = useRef<BottomSheetModal>(null);
  const sortSheetRef = useRef<BottomSheetModal>(null);

  const filters = useMemo(
    () => ({
      folderId: folderId === "unfiled" ? undefined : folderId,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      search: debouncedSearch || undefined,
      sortBy,
      sortOrder,
    }),
    [folderId, selectedTags, debouncedSearch, sortBy, sortOrder],
  );

  const {
    data: notes = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useNotes(filters);

  const { data: foldersData } = useFolders();
  const { data: tagsData } = useTags();
  const toggleFavorite = useToggleFavorite();

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(text);
    }, 300);
  }, []);

  const handleRefresh = useCallback(async () => {
    manualSync();
    await refetch();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [refetch]);

  const handleNotePress = useCallback(
    (noteId: string) => {
      navigation.navigate("NoteDetail", { noteId });
    },
    [navigation],
  );

  const handleToggleTag = useCallback((tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName],
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Note }) => (
      <NoteListItem note={item} onPress={handleNotePress} />
    ),
    [handleNotePress],
  );

  const hasActiveFilters = !!folderId || selectedTags.length > 0;

  // Mount Sort / Folder / Tags as compact icon buttons in the
  // navigator header, right-aligned next to the "Notes" title.
  // Tints flip to `primary` when the corresponding filter is
  // active. Tap clears the body filter row entirely; the user
  // adjusts everything from inside the bottom-sheet pickers.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => sortSheetRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel="Sort"
            style={styles.headerIconBtn}
          >
            <MaterialCommunityIcons
              name="sort"
              size={24}
              color={themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={() => folderSheetRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel="Folder"
            style={styles.headerIconBtn}
          >
            <MaterialCommunityIcons
              name="folder-outline"
              size={24}
              color={folderId ? themeColors.primary : themeColors.foreground}
            />
          </Pressable>
          <Pressable
            onPress={() => tagSheetRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel="Tags"
            style={styles.headerIconBtn}
          >
            <MaterialCommunityIcons
              name="tag-outline"
              size={24}
              color={
                selectedTags.length > 0
                  ? themeColors.primary
                  : themeColors.foreground
              }
            />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, folderId, selectedTags.length, themeColors]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchInput,
            {
              backgroundColor: themeColors.input,
              borderColor: themeColors.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={themeColors.muted}
          />
          <TextInput
            style={[styles.searchText, { color: themeColors.foreground }]}
            placeholder="Search notes..."
            placeholderTextColor={themeColors.muted}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable
              onPress={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={themeColors.muted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Selected tags chips */}
      {selectedTags.length > 0 ? (
        <View style={styles.tagChips}>
          {selectedTags.map((tag) => (
            <Pressable
              key={tag}
              style={[
                styles.tagChip,
                { backgroundColor: `${themeColors.primary}1A` },
              ]}
              onPress={() => handleToggleTag(tag)}
              accessibilityRole="button"
            >
              <Text style={[styles.tagChipText, { color: themeColors.primary }]}>
                {tag}
              </Text>
              <MaterialCommunityIcons
                name="close"
                size={14}
                color={themeColors.primary}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Content */}
      {isLoading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} style={styles.skeletonItem} />
          ))}
        </View>
      ) : isError ? (
        <ErrorCard message="Failed to load notes" onRetry={() => refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState
          message={
            debouncedSearch || hasActiveFilters
              ? "No notes match your filters"
              : "No notes yet"
          }
        />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={themeColors.primary}
            />
          }
          contentContainerStyle={styles.list}
        />
      )}

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: themeColors.primary }]}
        onPress={() => navigation.navigate("NoteEditor", {})}
        accessibilityRole="button"
        accessibilityLabel="Create new note"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#000" />
      </Pressable>

      {/* Bottom sheets */}
      <FolderPicker
        bottomSheetRef={folderSheetRef}
        folders={foldersData?.folders ?? []}
        selectedFolderId={folderId}
        onSelect={setFolderId}
      />
      <TagPicker
        bottomSheetRef={tagSheetRef}
        tags={tagsData?.tags ?? []}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        onClear={() => setSelectedTags([])}
      />
      <SortPicker
        bottomSheetRef={sortSheetRef}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onChangeSortBy={setSortBy}
        onChangeSortOrder={setSortOrder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    height: 40,
    gap: spacing.xs,
  },
  searchText: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  // Material Design 3 top-app-bar action item: 24 dp glyph
  // centered inside a 48 dp touch target via 12 dp padding.
  // The 12 dp internal padding on each button already produces
  // the right visual separation, so the inter-button gap is 0.
  // Source: https://m3.material.io/components/top-app-bar/specs
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  headerIconBtn: {
    padding: 12,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 4,
  },
  filterLabel: {
    fontSize: 13,
  },
  clearFilters: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: "auto",
  },
  tagChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 6,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  list: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  skeletons: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonItem: {
    marginBottom: spacing.sm,
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
