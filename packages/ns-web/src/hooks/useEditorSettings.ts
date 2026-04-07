import { useState, useCallback } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type ViewModeDefault = "editor" | "live" | "split" | "preview";
export type TabSizeOption = 2 | 4;
export type CursorStyle = "line" | "block" | "underline";
export type AccentColorPreset = "lime" | "blue" | "cyan" | "purple" | "orange" | "teal" | "pink" | "red" | "amber" | "black" | "white";

export const ACCENT_PRESETS: Record<AccentColorPreset, { dark: string; light: string; darkHover: string; lightHover: string }> = {
  lime:   { dark: "#d4e157", light: "#7c8a00", darkHover: "#c0ca33", lightHover: "#636e00" },
  blue:   { dark: "#42a5f5", light: "#1565c0", darkHover: "#1e88e5", lightHover: "#0d47a1" },
  cyan:   { dark: "#26c6da", light: "#00838f", darkHover: "#00acc1", lightHover: "#006064" },
  purple: { dark: "#ab47bc", light: "#7b1fa2", darkHover: "#8e24aa", lightHover: "#6a1b9a" },
  orange: { dark: "#ffa726", light: "#e65100", darkHover: "#fb8c00", lightHover: "#bf360c" },
  teal:   { dark: "#26a69a", light: "#00695c", darkHover: "#00897b", lightHover: "#004d40" },
  pink:   { dark: "#ec407a", light: "#c2185b", darkHover: "#d81b60", lightHover: "#ad1457" },
  red:    { dark: "#ef5350", light: "#c62828", darkHover: "#e53935", lightHover: "#b71c1c" },
  amber:  { dark: "#ffca28", light: "#ff8f00", darkHover: "#ffb300", lightHover: "#e65100" },
  black:  { dark: "#b0b0b0", light: "#1a1a1a", darkHover: "#9e9e9e", lightHover: "#000000" },
  white:  { dark: "#ffffff", light: "#666666", darkHover: "#e0e0e0", lightHover: "#444444" },
};

const VALID_ACCENT_COLORS: AccentColorPreset[] = Object.keys(ACCENT_PRESETS) as AccentColorPreset[];

export function resolveAccentColor(preset: AccentColorPreset, theme: "dark" | "light"): string {
  return ACCENT_PRESETS[preset][theme];
}

export interface EditorSettings {
  defaultViewMode: ViewModeDefault;
  showLineNumbers: boolean;
  wordWrap: boolean;
  autoSaveDelay: number;
  tabSize: TabSizeOption;
  theme: ThemeMode;
  editorFontSize: number;
  maxCachedNotes: number;
  accentColor: AccentColorPreset;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
}

const STORAGE_KEY = "ns-editor-settings";

const VALID_VIEW_MODES: ViewModeDefault[] = ["editor", "live", "split", "preview"];
const VALID_THEMES: ThemeMode[] = ["dark", "light", "system"];
const VALID_TAB_SIZES: TabSizeOption[] = [2, 4];
const VALID_CURSOR_STYLES: CursorStyle[] = ["line", "block", "underline"];

const DEFAULT_SETTINGS: EditorSettings = {
  defaultViewMode: "editor",
  showLineNumbers: true,
  wordWrap: true,
  autoSaveDelay: 1500,
  tabSize: 2,
  theme: "dark",
  editorFontSize: 14,
  maxCachedNotes: 100,
  accentColor: "lime",
  cursorStyle: "line",
  cursorBlink: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      defaultViewMode: VALID_VIEW_MODES.includes(parsed.defaultViewMode)
        ? parsed.defaultViewMode
        : "editor",
      showLineNumbers: typeof parsed.showLineNumbers === "boolean" ? parsed.showLineNumbers : true,
      wordWrap: typeof parsed.wordWrap === "boolean" ? parsed.wordWrap : true,
      autoSaveDelay: typeof parsed.autoSaveDelay === "number"
        ? clamp(parsed.autoSaveDelay, 500, 5000)
        : 1500,
      tabSize: VALID_TAB_SIZES.includes(parsed.tabSize) ? parsed.tabSize : 2,
      theme: VALID_THEMES.includes(parsed.theme) ? parsed.theme : "dark",
      editorFontSize: typeof parsed.editorFontSize === "number"
        ? clamp(parsed.editorFontSize, 10, 24)
        : 14,
      maxCachedNotes: typeof parsed.maxCachedNotes === "number"
        ? clamp(parsed.maxCachedNotes, 10, 500)
        : 100,
      accentColor: VALID_ACCENT_COLORS.includes(parsed.accentColor)
        ? parsed.accentColor
        : "lime",
      cursorStyle: VALID_CURSOR_STYLES.includes(parsed.cursorStyle)
        ? parsed.cursorStyle
        : "line",
      cursorBlink: typeof parsed.cursorBlink === "boolean" ? parsed.cursorBlink : true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useEditorSettings(): {
  settings: EditorSettings;
  updateSetting: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
} {
  const [settings, setSettings] = useState<EditorSettings>(loadSettings);

  const updateSetting = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  return { settings, updateSetting };
}
