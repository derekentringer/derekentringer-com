// Dashboard layout preferences. Mobile-only for now (web/desktop use
// a fixed dashboard layout). Persisted to AsyncStorage so the user's
// chosen FAB style + Quick Actions visibility survive relaunch.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DashboardSettings {
  /** When true the bottom-right FAB expands into a Material 3 speed-
   *  dial menu (New Note + Meeting/Lecture/Memo/Verbatim). When
   *  false, a single "+" FAB creates a new note and recording entry
   *  points come exclusively from the Quick Actions row. Default
   *  off — matches the simpler one-FAB Material guidance for users
   *  who haven't opted in. */
  speedDialEnabled: boolean;
  /** Whether to render the dashboard's Quick Actions row (New Note +
   *  the four recording modes). Default on. Turning this off is
   *  useful when the user prefers to launch recordings from the
   *  speed-dial FAB or doesn't use audio notes at all. */
  quickActionsEnabled: boolean;
}

const STORAGE_KEY = "ns-dashboard-settings";

const DEFAULT_SETTINGS: DashboardSettings = {
  speedDialEnabled: false,
  quickActionsEnabled: true,
};

function parseSettings(raw: string | null): DashboardSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      speedDialEnabled:
        typeof parsed.speedDialEnabled === "boolean"
          ? parsed.speedDialEnabled
          : DEFAULT_SETTINGS.speedDialEnabled,
      quickActionsEnabled:
        typeof parsed.quickActionsEnabled === "boolean"
          ? parsed.quickActionsEnabled
          : DEFAULT_SETTINGS.quickActionsEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface DashboardSettingsState extends DashboardSettings {
  isLoaded: boolean;
}

interface DashboardSettingsActions {
  hydrate: () => Promise<void>;
  setSpeedDialEnabled: (v: boolean) => void;
  setQuickActionsEnabled: (v: boolean) => void;
}

const useDashboardSettingsStore = create<
  DashboardSettingsState & DashboardSettingsActions
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

  setSpeedDialEnabled: (v) => {
    set({ speedDialEnabled: v });
    void persist(get());
  },

  setQuickActionsEnabled: (v) => {
    set({ quickActionsEnabled: v });
    void persist(get());
  },
}));

async function persist(state: DashboardSettingsState) {
  const payload: DashboardSettings = {
    speedDialEnabled: state.speedDialEnabled,
    quickActionsEnabled: state.quickActionsEnabled,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal; next mutation will retry.
  }
}

export default useDashboardSettingsStore;
export { DEFAULT_SETTINGS, parseSettings };
