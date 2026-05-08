import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Note } from "@derekentringer/ns-shared";
import { useNotes } from "@/hooks/useNotes";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { relativeTimeVerbose } from "@/lib/time";

interface AppendTargetSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  /** Tapping a row dismisses the sheet and asks the host to
   *  append the shared content to that note. */
  onSelectNote: (note: Note) => void;
}

/**
 * Phase E.3 — note picker for "Append to existing note" inside
 * the share-receiver overlay. Shows recently-modified notes by
 * default with a single-row search filter at the top so the user
 * can type to narrow the list when their target isn't in the
 * first few rows. Mirrors the visual rhythm of `VersionHistorySheet`
 * + `TocSheet`.
 */
export function AppendTargetSheet({
  bottomSheetRef,
  onSelectNote,
}: AppendTargetSheetProps) {
  const themeColors = useThemeColors();
  const [query, setQuery] = useState("");

  // Pull every non-trash note sorted by recently modified. The
  // append flow is rare and the list is small enough on phones
  // that a client-side title filter on the full set is faster
  // than re-issuing a server query per keystroke.
  const { data: notes } = useNotes({
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = notes ?? [];
    if (q.length === 0) return list;
    return list.filter((n) => (n.title ?? "").toLowerCase().includes(q));
  }, [notes, query]);

  const handlePress = useCallback(
    (note: Note) => {
      bottomSheetRef.current?.dismiss();
      onSelectNote(note);
    },
    [bottomSheetRef, onSelectNote],
  );

  const renderItem = useCallback(
    ({ item }: { item: Note }) => (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => handlePress(item)}
        accessibilityRole="button"
        accessibilityLabel={`Append to ${item.title || "Untitled"}`}
      >
        <View style={styles.rowText}>
          <Text
            style={[styles.title, { color: themeColors.foreground }]}
            numberOfLines={1}
          >
            {item.title || "Untitled"}
          </Text>
          <Text
            style={[styles.timestamp, { color: themeColors.muted }]}
            numberOfLines={1}
          >
            {relativeTimeVerbose(item.updatedAt)}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={themeColors.muted}
        />
      </Pressable>
    ),
    [handlePress, themeColors],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["75%", "90%"]}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
      backdropComponent={(props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
    >
      <BottomSheetView style={styles.header}>
        <MaterialCommunityIcons
          name="text-box-plus-outline"
          size={20}
          color={themeColors.primary}
        />
        <Text style={[styles.headerTitle, { color: themeColors.foreground }]}>
          Append to…
        </Text>
      </BottomSheetView>
      <BottomSheetView
        style={[
          styles.searchRow,
          {
            backgroundColor: themeColors.input,
            borderColor: themeColors.border,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="magnify"
          size={18}
          color={themeColors.muted}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes"
          placeholderTextColor={themeColors.muted}
          style={[styles.searchInput, { color: themeColors.foreground }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color={themeColors.muted}
            />
          </Pressable>
        ) : null}
      </BottomSheetView>
      {filtered.length === 0 ? (
        <BottomSheetView style={styles.empty}>
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            {notes && notes.length === 0
              ? "No notes yet"
              : "No notes match that search"}
          </Text>
        </BottomSheetView>
      ) : (
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item: Note) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  rowText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 12,
  },
  empty: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
});
