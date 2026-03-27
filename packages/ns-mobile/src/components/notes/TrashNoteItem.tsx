import React, { useCallback, useRef } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Note } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { stripMarkdown } from "@/lib/markdown";
import { relativeTime } from "@/lib/time";

interface TrashNoteItemProps {
  note: Note;
  folderName?: string;
  onPress: (noteId: string) => void;
  onRestore: (noteId: string) => void;
  onPermanentDelete: (noteId: string) => void;
}

export function TrashNoteItem({
  note,
  folderName,
  onPress,
  onRestore,
  onPermanentDelete,
}: TrashNoteItemProps) {
  const themeColors = useThemeColors();
  const swipeableRef = useRef<Swipeable>(null);
  const preview = stripMarkdown(note.content || "").slice(0, 120);
  const deletedTime = note.deletedAt ? relativeTime(note.deletedAt) : "";

  const handleRestore = useCallback(() => {
    swipeableRef.current?.close();
    onRestore(note.id);
  }, [note.id, onRestore]);

  const handlePermanentDelete = useCallback(() => {
    swipeableRef.current?.close();
    onPermanentDelete(note.id);
  }, [note.id, onPermanentDelete]);

  const renderLeftActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [0, 80],
        outputRange: [0.5, 1],
        extrapolate: "clamp",
      });

      return (
        <Pressable
          style={[styles.swipeAction, { backgroundColor: themeColors.success }]}
          onPress={handleRestore}
        >
          <Animated.View style={[styles.swipeActionContent, { transform: [{ scale }] }]}>
            <MaterialCommunityIcons name="restore" size={22} color="#fff" />
            <Text style={styles.swipeActionText}>Restore</Text>
          </Animated.View>
        </Pressable>
      );
    },
    [themeColors, handleRestore],
  );

  const renderRightActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: "clamp",
      });

      return (
        <Pressable
          style={[styles.swipeAction, { backgroundColor: themeColors.destructive }]}
          onPress={handlePermanentDelete}
        >
          <Animated.View style={[styles.swipeActionContent, { transform: [{ scale }] }]}>
            <MaterialCommunityIcons name="delete-forever" size={22} color="#fff" />
            <Text style={styles.swipeActionText}>Delete</Text>
          </Animated.View>
        </Pressable>
      );
    },
    [themeColors, handlePermanentDelete],
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        style={[
          styles.container,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
        ]}
        onPress={() => onPress(note.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open trashed note: ${note.title || "Untitled"}`}
      >
        <View style={styles.header}>
          <Text
            style={[styles.title, { color: themeColors.foreground }]}
            numberOfLines={1}
          >
            {note.title || "Untitled"}
          </Text>
          <Text style={[styles.time, { color: themeColors.muted }]}>
            {deletedTime}
          </Text>
        </View>

        {preview ? (
          <Text
            style={[styles.preview, { color: themeColors.muted }]}
            numberOfLines={1}
          >
            {preview}
          </Text>
        ) : null}

        <View style={styles.meta}>
          {folderName ? (
            <View
              style={[
                styles.folderBadge,
                { backgroundColor: themeColors.border },
              ]}
            >
              <Text
                style={[styles.folderText, { color: themeColors.muted }]}
                numberOfLines={1}
              >
                {folderName}
              </Text>
            </View>
          ) : null}
          <View
            style={[
              styles.deletedBadge,
              { backgroundColor: `${themeColors.destructive}1A` },
            ]}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={10}
              color={themeColors.destructive}
            />
            <Text style={[styles.deletedText, { color: themeColors.destructive }]}>
              Deleted
            </Text>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    fontSize: 11,
  },
  preview: {
    fontSize: 13,
    marginBottom: 6,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  folderBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 120,
  },
  folderText: {
    fontSize: 11,
  },
  deletedBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  deletedText: {
    fontSize: 10,
    fontWeight: "500",
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    marginBottom: spacing.sm,
  },
  swipeActionContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  swipeActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});
