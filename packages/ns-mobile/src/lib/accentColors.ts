// Mirror of `packages/ns-desktop/src/hooks/useEditorSettings.ts`
// (and the matching ns-web copy) so the mobile accent palette stays
// in lockstep with web/desktop. Adding a preset on one platform
// should land on all three; keep the keys + hex values identical.

export type AccentColorPreset =
  | "lime"
  | "blue"
  | "cyan"
  | "purple"
  | "orange"
  | "teal"
  | "pink"
  | "red"
  | "amber"
  | "black"
  | "white"
  | "custom";

export interface AccentVariants {
  /** Used when the active theme is dark. */
  dark: string;
  /** Used when the active theme is light — pre-darkened for AA
   *  contrast on a light background. */
  light: string;
  /** Hover/pressed darken for the dark theme. */
  darkHover: string;
  /** Hover/pressed darken for the light theme. */
  lightHover: string;
}

/** Derive dark/light/hover variants from a single user-picked hex.
 *  Same factor table as desktop so a custom hex resolves identically
 *  on every device. */
export function deriveAccentColors(hex: string): AccentVariants {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darken = (c: number, f: number) => Math.max(0, Math.round(c * f));
  const toHex = (r2: number, g2: number, b2: number) =>
    `#${[r2, g2, b2].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  return {
    dark: hex,
    light: toHex(darken(r, 0.6), darken(g, 0.6), darken(b, 0.6)),
    darkHover: toHex(darken(r, 0.85), darken(g, 0.85), darken(b, 0.85)),
    lightHover: toHex(darken(r, 0.45), darken(g, 0.45), darken(b, 0.45)),
  };
}

export const ACCENT_PRESETS: Record<
  Exclude<AccentColorPreset, "custom">,
  AccentVariants
> = {
  lime: { dark: "#d4e157", light: "#7c8a00", darkHover: "#c0ca33", lightHover: "#636e00" },
  blue: { dark: "#42a5f5", light: "#1565c0", darkHover: "#1e88e5", lightHover: "#0d47a1" },
  cyan: { dark: "#26c6da", light: "#00838f", darkHover: "#00acc1", lightHover: "#006064" },
  purple: { dark: "#ab47bc", light: "#7b1fa2", darkHover: "#8e24aa", lightHover: "#6a1b9a" },
  orange: { dark: "#ffa726", light: "#e65100", darkHover: "#fb8c00", lightHover: "#bf360c" },
  teal: { dark: "#26a69a", light: "#00695c", darkHover: "#00897b", lightHover: "#004d40" },
  pink: { dark: "#ec407a", light: "#c2185b", darkHover: "#d81b60", lightHover: "#ad1457" },
  red: { dark: "#ef5350", light: "#c62828", darkHover: "#e53935", lightHover: "#b71c1c" },
  amber: { dark: "#ffca28", light: "#ff8f00", darkHover: "#ffb300", lightHover: "#e65100" },
  black: { dark: "#b0b0b0", light: "#1a1a1a", darkHover: "#9e9e9e", lightHover: "#000000" },
  white: { dark: "#ffffff", light: "#666666", darkHover: "#e0e0e0", lightHover: "#444444" },
};

export const ACCENT_PRESET_KEYS: Exclude<AccentColorPreset, "custom">[] = [
  "lime",
  "blue",
  "cyan",
  "purple",
  "orange",
  "teal",
  "pink",
  "red",
  "amber",
  "black",
  "white",
];

const VALID_ACCENT_COLORS: AccentColorPreset[] = [
  ...ACCENT_PRESET_KEYS,
  "custom",
];

export function isAccentPreset(value: unknown): value is AccentColorPreset {
  return (
    typeof value === "string" && VALID_ACCENT_COLORS.includes(value as AccentColorPreset)
  );
}

/** Resolve a single hex string for the active theme + accent. */
export function resolveAccentColor(
  preset: AccentColorPreset,
  theme: "dark" | "light",
  customHex?: string,
): string {
  if (preset === "custom" && customHex) {
    return deriveAccentColors(customHex)[theme];
  }
  if (preset === "custom") return "#d4e157";
  return ACCENT_PRESETS[preset][theme];
}

/** Resolve the matching hover variant for the active theme + accent. */
export function resolveAccentHover(
  preset: AccentColorPreset,
  theme: "dark" | "light",
  customHex?: string,
): string {
  const key = theme === "dark" ? "darkHover" : "lightHover";
  if (preset === "custom" && customHex) {
    return deriveAccentColors(customHex)[key];
  }
  if (preset === "custom") return ACCENT_PRESETS.lime[key];
  return ACCENT_PRESETS[preset][key];
}
