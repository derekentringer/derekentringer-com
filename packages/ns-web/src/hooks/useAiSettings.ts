import { useState, useCallback } from "react";

export interface AiSettings {
  completions: boolean;
  summarize: boolean;
  tagSuggestions: boolean;
}

const STORAGE_KEY = "ns-ai-settings";

const DEFAULT_SETTINGS: AiSettings = {
  completions: false,
  summarize: false,
  tagSuggestions: false,
};

function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      completions: typeof parsed.completions === "boolean" ? parsed.completions : false,
      summarize: typeof parsed.summarize === "boolean" ? parsed.summarize : false,
      tagSuggestions: typeof parsed.tagSuggestions === "boolean" ? parsed.tagSuggestions : false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAiSettings(): {
  settings: AiSettings;
  updateSetting: (key: keyof AiSettings, value: boolean) => void;
} {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);

  const updateSetting = useCallback(
    (key: keyof AiSettings, value: boolean) => {
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
