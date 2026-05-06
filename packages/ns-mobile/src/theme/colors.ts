import { useColorScheme } from "react-native";
import useEditorSettingsStore from "@/store/editorSettingsStore";
import { resolveAccentColor, resolveAccentHover } from "@/lib/accentColors";

export const darkColors = {
  background: "#0f1117",
  card: "#12141b",
  /** Slightly lighter tint used for user message bubbles in the AI
   *  chat, matching desktop/web's `bg-subtle`. Distinct from `card`
   *  so user vs assistant bubbles read as different lanes at a
   *  glance. */
  subtle: "#1a1d27",
  foreground: "#ececec",
  primary: "#d4e157",
  primaryDark: "#c0ca33",
  destructive: "#dc2626",
  destructiveHover: "#b91c1c",
  border: "#1e2028",
  muted: "#999999",
  mutedForeground: "#666666",
  input: "#10121a",
  error: "#ef4444",
  success: "#22c55e",
  /** Amber-500 — used for "pending destructive action" cues on
   *  confirmation cards (matches desktop's `border-amber-500/40`
   *  and `text-amber-500` warning icon). */
  warning: "#f59e0b",
  tabInactive: "#666666",
  /** Text color used inside tag pills (note cards, lists, detail
   *  views). On dark/light themes this matches the active accent so
   *  the pills carry the same hue as other primary elements. The
   *  Teams palette overrides this to a near-white for legibility
   *  against its faint-purple pill background. */
  tagText: "#d4e157",
} as const;

export const lightColors = {
  background: "#ffffff",
  card: "#f5f5f5",
  subtle: "#ebebed",
  foreground: "#1a1a1a",
  primary: "#c0ca33",
  primaryDark: "#9e9d24",
  destructive: "#dc2626",
  destructiveHover: "#b91c1c",
  border: "#e0e0e0",
  muted: "#666666",
  mutedForeground: "#999999",
  input: "#f0f0f0",
  error: "#ef4444",
  success: "#22c55e",
  warning: "#f59e0b",
  // Near-black on light mode so the bottom tab labels read clearly
  // against the white tab bar — pale gray is too low-contrast for
  // small label text. Active tab still pops because it switches to
  // the accent `primary` color.
  tabInactive: "#1a1a1a",
  tagText: "#7c8a00",
} as const;

// Microsoft Teams dark palette — matches the Fluent UI brandTeamsV21
// tokens that ns-desktop's `[data-theme="teams"]` block uses. Teams
// is a third theme option distinct from dark/light: dark-style
// charcoal backgrounds + a forced purple primary that ignores the
// user's accent choice, mirroring desktop behavior.
export const teamsColors = {
  background: "#242424",
  card: "#292929",
  subtle: "#2e2e2e",
  foreground: "#ffffff",
  primary: "#887dff",
  primaryDark: "#7769fa",
  destructive: "#dc2626",
  destructiveHover: "#b91c1c",
  border: "#3d3d3d",
  muted: "#adadad",
  mutedForeground: "#999999",
  input: "#1f1f1f",
  error: "#ef4444",
  success: "#22c55e",
  warning: "#f59e0b",
  tabInactive: "#999999",
  // Soft near-white with a hint of gray. Matches the Teams-theme
  // override on web/desktop so tag labels stay legible against the
  // faint purple pill background instead of melting into it.
  tagText: "#dcdce0",
} as const;

export type ThemeColors = {
  background: string;
  card: string;
  subtle: string;
  foreground: string;
  primary: string;
  primaryDark: string;
  destructive: string;
  destructiveHover: string;
  border: string;
  muted: string;
  mutedForeground: string;
  input: string;
  error: string;
  success: string;
  warning: string;
  tabInactive: string;
  tagText: string;
};

/** Resolve the active theme to a concrete light/dark mode. Teams
 *  renders as a dark theme for purposes of icon-tinting + accent-
 *  variant selection. "system" defers to the OS. */
export function useResolvedTheme(): "dark" | "light" {
  const themePref = useEditorSettingsStore((s) => s.theme);
  const systemScheme = useColorScheme();
  if (themePref === "dark") return "dark";
  if (themePref === "light") return "light";
  if (themePref === "teams") return "dark";
  return systemScheme === "light" ? "light" : "dark";
}

/** Returns the active palette with `primary` + `primaryDark`
 *  overlaid by the user's chosen accent. Components consume this
 *  via `useThemeColors()` so flipping the accent at runtime
 *  re-renders every screen with the new color. The Teams theme is
 *  the exception — it forces its own purple primary regardless of
 *  the chosen accent, matching the desktop `[data-theme="teams"]`
 *  CSS that hardcodes `--color-primary: #887dff`. */
export function useThemeColors(): ThemeColors {
  const themePref = useEditorSettingsStore((s) => s.theme);
  const resolved = useResolvedTheme();
  const accent = useEditorSettingsStore((s) => s.accentColor);
  const customHex = useEditorSettingsStore((s) => s.customAccentColor);

  if (themePref === "teams") return teamsColors;

  const base = resolved === "light" ? lightColors : darkColors;
  const primary = resolveAccentColor(accent, resolved, customHex);
  return {
    ...base,
    primary,
    primaryDark: resolveAccentHover(accent, resolved, customHex),
    // Tag pills follow the active accent on dark/light themes — same
    // hue as primary so the chip + label read as one unit. Teams
    // overrides this in the palette block above.
    tagText: primary,
  };
}
