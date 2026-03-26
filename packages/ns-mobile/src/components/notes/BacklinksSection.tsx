import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { BacklinkInfo } from "@derekentringer/ns-shared";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

interface BacklinksSectionProps {
  backlinks: BacklinkInfo[];
  onPress: (noteId: string) => void;
}

export function BacklinksSection({ backlinks, onPress }: BacklinksSectionProps) {
  const themeColors = useThemeColors();

  if (backlinks.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="link-variant"
          size={16}
          color={themeColors.muted}
        />
        <Text style={[styles.title, { color: themeColors.muted }]}>
          Backlinks ({backlinks.length})
        </Text>
      </View>

      {backlinks.map((backlink) => (
        <Pressable
          key={backlink.noteId}
          style={[
            styles.item,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}
          onPress={() => onPress(backlink.noteId)}
          accessibilityRole="button"
          accessibilityLabel={`Go to note: ${backlink.noteTitle}`}
        >
          <Text
            style={[styles.noteTitle, { color: themeColors.foreground }]}
            numberOfLines={1}
          >
            {backlink.noteTitle}
          </Text>
          {backlink.linkText ? (
            <Text
              style={[styles.linkText, { color: themeColors.muted }]}
              numberOfLines={1}
            >
              {backlink.linkText}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  item: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  linkText: {
    fontSize: 12,
    marginTop: 2,
  },
});
