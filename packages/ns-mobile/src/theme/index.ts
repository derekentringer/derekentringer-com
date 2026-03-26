export { darkColors as colors, lightColors, useThemeColors } from "./colors";
export type { ThemeColors } from "./colors";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;
