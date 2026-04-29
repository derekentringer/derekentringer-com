// Mirrors `packages/ns-{web,desktop}/src/hooks/useEditorSettings.ts`
// for the parity slice we need on mobile right now: a persisted
// `propertiesMode` toggle that controls whether YAML frontmatter is
// shown ("source") or hidden ("panel") in the editor. Default
// matches web — "panel" (hidden) — so a fresh mobile editor session
// starts without the raw `--- ... ---` block in the way.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PropertiesMode = "panel" | "source";

export interface EditorSettings {
  propertiesMode: PropertiesMode;
}

const STORAGE_KEY = "ns-editor-settings";

const DEFAULT_SETTINGS: EditorSettings = {
  propertiesMode: "panel",
};

function parseSettings(raw: string | null): EditorSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      propertiesMode:
        parsed.propertiesMode === "source" ? "source" : "panel",
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
}));

async function persist(state: EditorSettingsState) {
  const payload: EditorSettings = {
    propertiesMode: state.propertiesMode,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal; next mutation will retry.
  }
}

export default useEditorSettingsStore;
export { DEFAULT_SETTINGS, parseSettings };
