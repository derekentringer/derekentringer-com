import { useState, useCallback } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type ViewModeDefault = "editor" | "split" | "preview";
export type TabSizeOption = 2 | 4;
export type AccentColorPreset = "lime" | "blue" | "cyan" | "purple" | "orange" | "teal" | "pink" | "red" | "amber" | "black" | "white";

export const ACCENT_PRESETS: Record<AccentColorPreset, { dark: string; light: string }> = {
  lime:   { dark: "#d4e157", light: "#7c8a00" },
  blue:   { dark: "#42a5f5", light: "#1565c0" },
  cyan:   { dark: "#26c6da", light: "#00838f" },
  purple: { dark: "#ab47bc", light: "#7b1fa2" },
  orange: { dark: "#ffa726", light: "#e65100" },
  teal:   { dark: "#26a69a", light: "#00695c" },
  pink:   { dark: "#ec407a", light: "#c2185b" },
  red:    { dark: "#ef5350", light: "#c62828" },
  amber:  { dark: "#ffca28", light: "#ff8f00" },
  black:  { dark: "#b0b0b0", light: "#1a1a1a" },
  white:  { dark: "#ffffff", light: "#666666" },
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
}

const STORAGE_KEY = "ns-editor-settings";

const VALID_VIEW_MODES: ViewModeDefault[] = ["editor", "split", "preview"];
const VALID_THEMES: ThemeMode[] = ["dark", "light", "system"];
const VALID_TAB_SIZES: TabSizeOption[] = [2, 4];

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
