import { useColorScheme } from "react-native";

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
  tabInactive: "#999999",
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
};

export function useThemeColors(): ThemeColors {
  const colorScheme = useColorScheme();
  return colorScheme === "light" ? lightColors : darkColors;
}
