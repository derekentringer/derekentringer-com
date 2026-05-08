import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import SyntaxHighlighter from "react-native-syntax-highlighter";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors, type ThemeColors } from "@/theme/colors";
import { borderRadius, spacing } from "@/theme";

const MONOSPACE_FONT = Platform.OS === "ios" ? "Menlo-Regular" : "monospace";

/**
 * Build a react-syntax-highlighter style object that mirrors web's
 * `.hljs-*` class → CSS variable mapping in `global.css`. The
 * groupings (which classes share which color) are kept identical
 * to web so a snippet looks the same on both platforms.
 *
 * The `hljs` root sets the body's transparent background — the
 * outer `MarkdownCodeBlock` container already paints the card
 * color; we don't want a second swatch under the highlighted
 * tokens.
 */
function buildHljsTheme(themeColors: ThemeColors): Record<string, Record<string, string | number>> {
  const keyword = { color: themeColors.hljsKeyword };
  const str = { color: themeColors.hljsString };
  const comment = { color: themeColors.hljsComment };
  const number = { color: themeColors.hljsNumber };
  const fn = { color: themeColors.hljsFunction };
  const variable = { color: themeColors.hljsVariable };
  // Every value in this map must be a string. The library's
  // `generateNewStylesheet` calls `value.includes('em')` on each
  // style value (to convert `"0.5em"` → 8px), which throws if a
  // value is a number. Padding is intentionally omitted — the
  // outer ScrollView's `contentContainerStyle` already pads the
  // body, so we don't need to push padding through this map.
  return {
    hljs: {
      backgroundColor: "transparent",
      color: themeColors.foreground,
    },
    "hljs-keyword": keyword,
    "hljs-selector-tag": keyword,
    "hljs-built_in": keyword,
    "hljs-name": keyword,
    "hljs-tag": keyword,
    "hljs-string": str,
    "hljs-title": str,
    "hljs-section": str,
    "hljs-attribute": str,
    "hljs-literal": str,
    "hljs-template-tag": str,
    "hljs-template-variable": str,
    "hljs-type": str,
    "hljs-comment": comment,
    "hljs-deletion": comment,
    "hljs-number": number,
    "hljs-regexp": number,
    "hljs-meta": number,
    "hljs-function": fn,
    "hljs-variable": variable,
    "hljs-params": variable,
    "hljs-addition": { color: themeColors.success },
  };
}

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

  // hljs theme rebuilds only when the active palette changes (theme
  // switch / accent change). The library memoizes by reference too.
  const hljsTheme = useMemo(() => buildHljsTheme(themeColors), [themeColors]);

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
        {language ? (
          <SyntaxHighlighter
            language={language}
            style={hljsTheme}
            highlighter="highlightjs"
            fontFamily={MONOSPACE_FONT}
            fontSize={13}
            // Suppress the lib's internal Pre/Code ScrollViews —
            // we already wrap in our own horizontal ScrollView
            // above. Nesting two horizontal scrollers steals
            // horizontal-pan gestures from the outer one.
            PreTag={View}
            CodeTag={View}
          >
            {content}
          </SyntaxHighlighter>
        ) : (
          <Text
            style={[styles.bodyText, { color: themeColors.foreground }]}
            selectable={false}
          >
            {content}
          </Text>
        )}
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
