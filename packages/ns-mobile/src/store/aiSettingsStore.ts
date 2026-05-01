// Phase A.6 (mobile parity): AI settings store.
//
// Mirrors `packages/ns-{web,desktop}/src/hooks/useAiSettings.ts` —
// persists the user's AI preferences across launches via
// AsyncStorage, exposes the same shape so the AiScreen + Settings
// section can read/write the same fields. Defaults stay
// conservative (auto-approve toggles all OFF) per the Phase C
// safety rationale.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AutoApproveSettings {
  deleteNote: boolean;
  deleteFolder: boolean;
  updateNoteContent: boolean;
  renameNote: boolean;
  renameFolder: boolean;
  renameTag: boolean;
}

export interface AiSettings {
  /** Master gate — when off, the AI tab is functionally disabled. */
  masterAiEnabled: boolean;
  /** Q&A chat panel toggle. */
  qaAssistant: boolean;
  /** "Summarize" command on the note action menu. */
  summarize: boolean;
  /** Tag-suggestion button surfaced from the editor. */
  tagSuggestions: boolean;
  /** Audio Notes — gates the dashboard Quick Actions recording row,
   *  the recording screen's mode picker, and the AI tab's recording
   *  pipeline. Mobile records mic-only; the web/desktop "recording
   *  source" sub-options aren't applicable here so this is a single
   *  boolean. */
  audioNotes: boolean;
  /** Per-tool bypass-the-confirmation-gate flags. */
  autoApprove: AutoApproveSettings;
}

const STORAGE_KEY = "ns-ai-settings";

const DEFAULT_AUTO_APPROVE: AutoApproveSettings = {
  deleteNote: false,
  deleteFolder: false,
  updateNoteContent: false,
  renameNote: false,
  renameFolder: false,
  renameTag: false,
};

const DEFAULT_SETTINGS: AiSettings = {
  masterAiEnabled: true,
  qaAssistant: true,
  summarize: false,
  tagSuggestions: false,
  audioNotes: false,
  autoApprove: DEFAULT_AUTO_APPROVE,
};

function parseAutoApprove(raw: unknown): AutoApproveSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_AUTO_APPROVE;
  const r = raw as Record<string, unknown>;
  return {
    deleteNote: typeof r.deleteNote === "boolean" ? r.deleteNote : false,
    deleteFolder: typeof r.deleteFolder === "boolean" ? r.deleteFolder : false,
    updateNoteContent:
      typeof r.updateNoteContent === "boolean" ? r.updateNoteContent : false,
    renameNote: typeof r.renameNote === "boolean" ? r.renameNote : false,
    renameFolder: typeof r.renameFolder === "boolean" ? r.renameFolder : false,
    renameTag: typeof r.renameTag === "boolean" ? r.renameTag : false,
  };
}

function parseSettings(raw: string | null): AiSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      masterAiEnabled:
        typeof parsed.masterAiEnabled === "boolean"
          ? parsed.masterAiEnabled
          : true,
      qaAssistant:
        typeof parsed.qaAssistant === "boolean" ? parsed.qaAssistant : true,
      summarize:
        typeof parsed.summarize === "boolean" ? parsed.summarize : false,
      tagSuggestions:
        typeof parsed.tagSuggestions === "boolean"
          ? parsed.tagSuggestions
          : false,
      audioNotes:
        typeof parsed.audioNotes === "boolean" ? parsed.audioNotes : false,
      autoApprove: parseAutoApprove(parsed.autoApprove),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface AiSettingsState extends AiSettings {
  isLoaded: boolean;
}

interface AiSettingsActions {
  hydrate: () => Promise<void>;
  setMasterAiEnabled: (v: boolean) => void;
  setQaAssistant: (v: boolean) => void;
  setSummarize: (v: boolean) => void;
  setTagSuggestions: (v: boolean) => void;
  setAudioNotes: (v: boolean) => void;
  setAutoApprove: (key: keyof AutoApproveSettings, v: boolean) => void;
}

const useAiSettingsStore = create<AiSettingsState & AiSettingsActions>()(
  (set, get) => ({
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

    setMasterAiEnabled: (v) => {
      set({ masterAiEnabled: v });
      void persist(get());
    },

    setQaAssistant: (v) => {
      set({ qaAssistant: v });
      void persist(get());
    },

    setSummarize: (v) => {
      set({ summarize: v });
      void persist(get());
    },

    setTagSuggestions: (v) => {
      set({ tagSuggestions: v });
      void persist(get());
    },

    setAudioNotes: (v) => {
      set({ audioNotes: v });
      void persist(get());
    },

    setAutoApprove: (key, v) => {
      set({ autoApprove: { ...get().autoApprove, [key]: v } });
      void persist(get());
    },
  }),
);

async function persist(state: AiSettingsState) {
  const payload: AiSettings = {
    masterAiEnabled: state.masterAiEnabled,
    qaAssistant: state.qaAssistant,
    summarize: state.summarize,
    tagSuggestions: state.tagSuggestions,
    audioNotes: state.audioNotes,
    autoApprove: state.autoApprove,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal; next mutation will retry.
  }
}

export default useAiSettingsStore;
export { DEFAULT_AUTO_APPROVE, DEFAULT_SETTINGS, parseSettings };
