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
}

export function MarkdownToolbar({ onAction }: MarkdownToolbarProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
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
