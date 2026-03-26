import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Note } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { stripMarkdown } from "@/lib/markdown";
import { relativeTime } from "@/lib/time";

interface NoteListItemProps {
  note: Note;
  onPress: (noteId: string) => void;
}

export function NoteListItem({ note, onPress }: NoteListItemProps) {
  const themeColors = useThemeColors();
  const preview = stripMarkdown(note.content || "").slice(0, 120);
  const maxTags = 3;
  const visibleTags = note.tags.slice(0, maxTags);
  const overflowCount = note.tags.length - maxTags;

  return (
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
      accessibilityLabel={`Open note: ${note.title || "Untitled"}`}
    >
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: themeColors.foreground }]}
          numberOfLines={1}
        >
          {note.title || "Untitled"}
        </Text>
        <Text style={[styles.time, { color: themeColors.muted }]}>
          {relativeTime(note.updatedAt)}
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
        {note.folder ? (
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
              {note.folder}
            </Text>
          </View>
        ) : null}

        {visibleTags.length > 0 ? (
          <View style={styles.tags}>
            {visibleTags.map((tag) => (
              <View
                key={tag}
                style={[
                  styles.tagChip,
                  { backgroundColor: `${themeColors.primary}1A` },
                ]}
              >
                <Text
                  style={[styles.tagText, { color: themeColors.primary }]}
                  numberOfLines={1}
                >
                  {tag}
                </Text>
              </View>
            ))}
            {overflowCount > 0 ? (
              <View
                style={[
                  styles.tagChip,
                  { backgroundColor: `${themeColors.primary}1A` },
                ]}
              >
                <Text style={[styles.tagText, { color: themeColors.primary }]}>
                  +{overflowCount}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
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
  tags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagChip: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 80,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "500",
  },
});
