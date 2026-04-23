import { useState, useCallback } from "react";

export type CompletionStyle = "continue" | "markdown" | "brief" | "paragraph" | "structure";
export type AudioMode = "meeting" | "lecture" | "memo" | "verbatim";

const VALID_COMPLETION_STYLES: CompletionStyle[] = ["continue", "markdown", "brief"];
const VALID_AUDIO_MODES: AudioMode[] = ["meeting", "lecture", "memo", "verbatim"];

/**
 * Per-tool auto-approval for destructive tools Claude can invoke. When
 * a flag is true, the tool runs immediately instead of surfacing a
 * confirmation card in the chat. Phase C.5.
 */
export interface AutoApproveSettings {
  deleteNote: boolean;
  deleteFolder: boolean;
  updateNoteContent: boolean;
  renameFolder: boolean;
  renameTag: boolean;
}

export interface AiSettings {
  masterAiEnabled: boolean;
  completions: boolean;
  completionStyle: CompletionStyle;
  completionDebounceMs: number;
  continueWriting: boolean;
  summarize: boolean;
  tagSuggestions: boolean;
  rewrite: boolean;
  semanticSearch: boolean;
  audioNotes: boolean;
  audioMode: AudioMode;
  qaAssistant: boolean;
  autoApprove: AutoApproveSettings;
}

const STORAGE_KEY = "ns-ai-settings";

const DEFAULT_AUTO_APPROVE: AutoApproveSettings = {
  deleteNote: false,
  deleteFolder: false,
  updateNoteContent: false,
  renameFolder: false,
  renameTag: false,
};

const DEFAULT_SETTINGS: AiSettings = {
  masterAiEnabled: true,
  completions: false,
  completionStyle: "continue",
  completionDebounceMs: 600,
  continueWriting: false,
  summarize: false,
  tagSuggestions: false,
  rewrite: false,
  semanticSearch: false,
  audioNotes: false,
  audioMode: "meeting",
  qaAssistant: false,
  autoApprove: DEFAULT_AUTO_APPROVE,
};

function loadAutoApprove(raw: unknown): AutoApproveSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_AUTO_APPROVE;
  const r = raw as Record<string, unknown>;
  return {
    deleteNote: typeof r.deleteNote === "boolean" ? r.deleteNote : false,
    deleteFolder: typeof r.deleteFolder === "boolean" ? r.deleteFolder : false,
    updateNoteContent: typeof r.updateNoteContent === "boolean" ? r.updateNoteContent : false,
    renameFolder: typeof r.renameFolder === "boolean" ? r.renameFolder : false,
    renameTag: typeof r.renameTag === "boolean" ? r.renameTag : false,
  };
}

function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      masterAiEnabled: typeof parsed.masterAiEnabled === "boolean" ? parsed.masterAiEnabled : true,
      completions: typeof parsed.completions === "boolean" ? parsed.completions : false,
      completionStyle: VALID_COMPLETION_STYLES.includes(parsed.completionStyle)
        ? parsed.completionStyle
        : "continue",
      completionDebounceMs: typeof parsed.completionDebounceMs === "number"
        ? Math.max(200, Math.min(1500, parsed.completionDebounceMs))
        : 600,
      continueWriting: typeof parsed.continueWriting === "boolean" ? parsed.continueWriting : false,
      summarize: typeof parsed.summarize === "boolean" ? parsed.summarize : false,
      tagSuggestions: typeof parsed.tagSuggestions === "boolean" ? parsed.tagSuggestions : false,
      rewrite: typeof parsed.rewrite === "boolean" ? parsed.rewrite : false,
      semanticSearch: typeof parsed.semanticSearch === "boolean" ? parsed.semanticSearch : false,
      audioNotes: typeof parsed.audioNotes === "boolean" ? parsed.audioNotes : false,
      audioMode: VALID_AUDIO_MODES.includes(parsed.audioMode) ? parsed.audioMode : "meeting",
      qaAssistant: typeof parsed.qaAssistant === "boolean" ? parsed.qaAssistant : false,
      autoApprove: loadAutoApprove(parsed.autoApprove),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAiSettings(): {
  settings: AiSettings;
  updateSetting: <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => void;
} {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);

  const updateSetting = useCallback(
    <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
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
