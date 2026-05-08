// Mirrors the relevant slice of `useEditorSettings.ts` from
// ns-web / ns-desktop. Storage key (`ns-editor-settings`) is shared
// only conceptually — web/desktop persist via localStorage, mobile
// via AsyncStorage — but the field names + valid-value sets stay in
// lockstep so a future cross-platform sync of preferences is a
// simple key-by-key copy.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type AccentColorPreset,
  isAccentPreset,
} from "@/lib/accentColors";

export type PropertiesMode = "panel" | "source";
export type ThemeMode = "dark" | "light" | "system" | "teams";

export interface EditorSettings {
  propertiesMode: PropertiesMode;
  /** Picks which color palette `useThemeColors()` returns. `system`
   *  falls back to the OS preference via React Native's
   *  `useColorScheme()`. */
  theme: ThemeMode;
  /** Chosen accent preset. Drives the `primary` color across the
   *  entire app. */
  accentColor: AccentColorPreset;
  /** Hex stored when the user picks the `"custom"` accent. v1
   *  doesn't expose a color picker on mobile yet, but the field
   *  round-trips so an existing custom value set on web/desktop
   *  syncs cleanly when the picker lands. */
  customAccentColor: string;
  /** Body-text font size used inside the note editor. Range
   *  10–24 to match desktop/web. */
  editorFontSize: number;
}

const STORAGE_KEY = "ns-editor-settings";

const VALID_THEMES: ThemeMode[] = ["dark", "light", "system", "teams"];

const DEFAULT_SETTINGS: EditorSettings = {
  propertiesMode: "panel",
  theme: "system",
  accentColor: "lime",
  customAccentColor: "#d4e157",
  editorFontSize: 14,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseSettings(raw: string | null): EditorSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      propertiesMode:
        parsed.propertiesMode === "source" ? "source" : "panel",
      theme:
        typeof parsed.theme === "string" &&
        VALID_THEMES.includes(parsed.theme as ThemeMode)
          ? (parsed.theme as ThemeMode)
          : DEFAULT_SETTINGS.theme,
      accentColor: isAccentPreset(parsed.accentColor)
        ? parsed.accentColor
        : DEFAULT_SETTINGS.accentColor,
      customAccentColor:
        typeof parsed.customAccentColor === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(parsed.customAccentColor)
          ? parsed.customAccentColor
          : DEFAULT_SETTINGS.customAccentColor,
      editorFontSize:
        typeof parsed.editorFontSize === "number"
          ? clamp(parsed.editorFontSize, 10, 24)
          : DEFAULT_SETTINGS.editorFontSize,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface EditorSettingsState extends EditorSettings {
  isLoaded: boolean;
}

interface EditorSettingsActions {
  hydrate: () => Promise<void>;
  setPropertiesMode: (v: PropertiesMode) => void;
  togglePropertiesMode: () => void;
  setTheme: (v: ThemeMode) => void;
  setAccentColor: (v: AccentColorPreset) => void;
  setCustomAccentColor: (v: string) => void;
  setEditorFontSize: (v: number) => void;
}

const useEditorSettingsStore = create<
  EditorSettingsState & EditorSettingsActions
>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = parseSettings(raw);
      set({ ...parsed, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  setPropertiesMode: (v) => {
    set({ propertiesMode: v });
    void persist(get());
  },

  togglePropertiesMode: () => {
    const next: PropertiesMode =
      get().propertiesMode === "source" ? "panel" : "source";
    set({ propertiesMode: next });
    void persist(get());
  },

  setTheme: (v) => {
    set({ theme: v });
    void persist(get());
  },

  setAccentColor: (v) => {
    set({ accentColor: v });
    void persist(get());
  },

  setCustomAccentColor: (v) => {
    set({ customAccentColor: v });
    void persist(get());
  },

  setEditorFontSize: (v) => {
    set({ editorFontSize: clamp(v, 10, 24) });
    void persist(get());
  },
}));

async function persist(state: EditorSettingsState) {
  const payload: EditorSettings = {
    propertiesMode: state.propertiesMode,
    theme: state.theme,
    accentColor: state.accentColor,
    customAccentColor: state.customAccentColor,
    editorFontSize: state.editorFontSize,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal; next mutation will retry.
  }
}

export default useEditorSettingsStore;
export { DEFAULT_SETTINGS, parseSettings };
