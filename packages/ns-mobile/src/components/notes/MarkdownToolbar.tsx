import React from "react";
import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing } from "@/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface ToolbarButton {
  icon: IconName;
  label: string;
  action: string;
}

const BUTTONS: ToolbarButton[] = [
  { icon: "format-bold", label: "Bold", action: "bold" },
  { icon: "format-italic", label: "Italic", action: "italic" },
  { icon: "format-header-pound", label: "Heading", action: "heading" },
  { icon: "link-variant", label: "Link", action: "link" },
  { icon: "format-list-bulleted", label: "List", action: "list" },
  { icon: "checkbox-marked-outline", label: "Checkbox", action: "checkbox" },
  { icon: "code-tags", label: "Code", action: "code" },
  { icon: "format-quote-close", label: "Quote", action: "quote" },
];

interface MarkdownToolbarProps {
  onAction: (action: string) => void;
  /** Optional handler for the sparkle "AI" button. When provided
   *  a sparkle button is rendered at the start of the toolbar
   *  (Phase B: opens the AI actions sheet). When omitted the
   *  button is hidden so consumers that don't surface AI actions
   *  see the toolbar unchanged. */
  onAiPress?: () => void;
  /** Optional handler for the image-plus button. When provided
   *  the button is rendered at the end of the toolbar (Phase D:
   *  opens the image picker sheet). Hidden when omitted. */
  onImagePress?: () => void;
}

export function MarkdownToolbar({
  onAction,
  onAiPress,
  onImagePress,
}: MarkdownToolbarProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {onAiPress ? (
          <Pressable
            onPress={onAiPress}
            style={({ pressed }) => [
              styles.button,
              pressed && { backgroundColor: `${themeColors.primary}1A` },
            ]}
            accessibilityRole="button"
            accessibilityLabel="AI actions"
          >
            <MaterialCommunityIcons
              name="auto-fix"
              size={22}
              color={themeColors.primary}
            />
          </Pressable>
        ) : null}
        {BUTTONS.map((btn) => (
          <Pressable
            key={btn.action}
            onPress={() => onAction(btn.action)}
            style={({ pressed }) => [
              styles.button,
              pressed && { backgroundColor: `${themeColors.primary}1A` },
            ]}
            accessibilityRole="button"
            accessibilityLabel={btn.label}
          >
            <MaterialCommunityIcons
              name={btn.icon}
              size={22}
              color={themeColors.foreground}
            />
          </Pressable>
        ))}
        {onImagePress ? (
          <Pressable
            onPress={onImagePress}
            style={({ pressed }) => [
              styles.button,
              pressed && { backgroundColor: `${themeColors.primary}1A` },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Insert image"
          >
            <MaterialCommunityIcons
              name="image-plus"
              size={22}
              color={themeColors.foreground}
            />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingVertical: 4,
  },
  scrollContent: {
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  button: {
    width: 42,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
});
