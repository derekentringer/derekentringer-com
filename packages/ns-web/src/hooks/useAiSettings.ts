import { useState, useCallback } from "react";

export type CompletionStyle = "continue" | "markdown" | "brief";

const VALID_COMPLETION_STYLES: CompletionStyle[] = ["continue", "markdown", "brief"];

export interface AiSettings {
  completions: boolean;
  completionStyle: CompletionStyle;
  summarize: boolean;
  tagSuggestions: boolean;
  rewrite: boolean;
  semanticSearch: boolean;
}

const STORAGE_KEY = "ns-ai-settings";

const DEFAULT_SETTINGS: AiSettings = {
  completions: false,
  completionStyle: "continue",
  summarize: false,
  tagSuggestions: false,
  rewrite: false,
  semanticSearch: false,
};

function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      completions: typeof parsed.completions === "boolean" ? parsed.completions : false,
      completionStyle: VALID_COMPLETION_STYLES.includes(parsed.completionStyle)
        ? parsed.completionStyle
        : "continue",
      summarize: typeof parsed.summarize === "boolean" ? parsed.summarize : false,
      tagSuggestions: typeof parsed.tagSuggestions === "boolean" ? parsed.tagSuggestions : false,
      rewrite: typeof parsed.rewrite === "boolean" ? parsed.rewrite : false,
      semanticSearch: typeof parsed.semanticSearch === "boolean" ? parsed.semanticSearch : false,
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
