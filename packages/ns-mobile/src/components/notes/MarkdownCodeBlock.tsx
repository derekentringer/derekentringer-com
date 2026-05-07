import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { borderRadius, spacing } from "@/theme";

interface MarkdownCodeBlockProps {
  /** The fenced code's body (already trimmed of the trailing newline). */
  content: string;
  /** Language hint after the opening fence (`js`, `ts`, `python`,
   *  …). Empty string when the user wrote `\`\`\`` with no hint. */
  language: string;
}

/**
 * Phase 5a — code-block chrome.
 *
 * Visual layout:
 *   ┌──────────────────────────────────┐
 *   │ js                          [📋] │  ← header strip
 *   ├──────────────────────────────────┤
 *   │ function greet() {               │  ← horizontal scroll body
 *   │   return "hi";                   │
 *   │ }                                │
 *   └──────────────────────────────────┘
 *
 * - Header strip is omitted entirely when the fence has no
 *   language hint (test fixture 6g) — the body still renders
 *   inside the bordered card so the visual remains "this is a
 *   code block."
 * - Long lines scroll horizontally inside the body (Phase 2
 *   behavior preserved).
 * - The copy button uses expo-clipboard, fires a Light haptic on
 *   tap, swaps to a checkmark for 1.5s as feedback, then resets.
 *   No real syntax coloring here — that's Phase 5b.
 */
export function MarkdownCodeBlock({ content, language }: MarkdownCodeBlockProps) {
  const themeColors = useThemeColors();
  const [copied, setCopied] = useState(false);
  // Track the active timeout so re-taps don't leave stale resets
  // running (which would flip an already-fresh state back).
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(content);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [content]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const showHeader = language.length > 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
    >
      {showHeader ? (
        <View
          style={[
            styles.header,
            { borderBottomColor: themeColors.border },
          ]}
        >
          <Text style={[styles.languageLabel, { color: themeColors.muted }]}>
            {language}
          </Text>
          <Pressable
            onPress={handleCopy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={copied ? "Copied" : "Copy code"}
            style={({ pressed }) => [
              styles.copyButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <MaterialCommunityIcons
              name={copied ? "check" : "content-copy"}
              size={16}
              color={copied ? themeColors.primary : themeColors.muted}
            />
          </Pressable>
        </View>
      ) : (
        // No language hint, but we still want the copy affordance
        // somewhere visible. Render a tighter mini-header with
        // just the copy button, right-aligned.
        <View style={styles.headerNoLang}>
          <Pressable
            onPress={handleCopy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={copied ? "Copied" : "Copy code"}
            style={({ pressed }) => [
              styles.copyButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <MaterialCommunityIcons
              name={copied ? "check" : "content-copy"}
              size={16}
              color={copied ? themeColors.primary : themeColors.muted}
            />
          </Pressable>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
      >
        <Text
          style={[styles.bodyText, { color: themeColors.foreground }]}
          // Disable native text selection / accessibility actions
          // to keep the tap target on the inner code body the
          // sole concern of the surrounding ScrollView; users
          // copy via the explicit button.
          selectable={false}
        >
          {content}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginVertical: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  headerNoLang: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.sm,
    paddingTop: 6,
  },
  languageLabel: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "monospace",
    letterSpacing: 0.5,
    textTransform: "lowercase",
  },
  copyButton: {
    padding: 4,
  },
  bodyContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bodyText: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
  },
});
