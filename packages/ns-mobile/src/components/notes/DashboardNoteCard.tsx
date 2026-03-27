import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Note } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { stripMarkdown } from "@/lib/markdown";
import { relativeTime } from "@/lib/time";

interface DashboardNoteCardProps {
  note: Note;
  onPress: (noteId: string) => void;
  compact?: boolean;
  folderName?: string;
}

export function DashboardNoteCard({ note, onPress, compact, folderName }: DashboardNoteCardProps) {
  const themeColors = useThemeColors();
  const preview = stripMarkdown(note.content || "");
  const maxTags = compact ? 2 : 3;
  const visibleTags = note.tags.slice(0, maxTags);
  const overflowCount = note.tags.length - maxTags;

  return (
    <Pressable
      style={[
        compact ? styles.tileCard : styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
      onPress={() => onPress(note.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open note: ${note.title || "Untitled"}`}
    >
      <Text
        style={[styles.title, { color: themeColors.foreground }]}
        numberOfLines={1}
      >
        {note.title || "Untitled"}
      </Text>

      {preview ? (
        <Text
          style={[styles.preview, { color: themeColors.muted }]}
          numberOfLines={2}
        >
          {preview}
        </Text>
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

      <View style={styles.spacer} />
      <View style={styles.footer}>
        {(folderName || note.folder) ? (
          <Text
            style={[styles.folderText, { color: themeColors.muted }]}
            numberOfLines={1}
          >
            {folderName || note.folder}
          </Text>
        ) : null}
        <Text style={[styles.timeText, { color: themeColors.muted }]}>
          {relativeTime(note.updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginRight: spacing.sm,
  },
  tileCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  preview: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  folderText: {
    fontSize: 10,
    maxWidth: 120,
  },
  timeText: {
    fontSize: 10,
    marginLeft: "auto",
  },
});
