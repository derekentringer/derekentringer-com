import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAiSettings, type CompletionStyle, type AudioMode } from "../hooks/useAiSettings.ts";
import { enableEmbeddings, disableEmbeddings, getEmbeddingStatus } from "../api/ai.ts";
import type { EmbeddingStatus } from "@derekentringer/shared/ns";

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="relative group ml-1.5 inline-flex items-center" aria-label={tooltip}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md bg-card border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {tooltip}
      </span>
    </span>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
  info,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  info?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between py-3 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="text-sm text-foreground flex items-center">
        {label}
        {info && <InfoIcon tooltip={info} />}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-border"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

const TOGGLE_SETTINGS: { key: "completions" | "continueWriting" | "summarize" | "tagSuggestions" | "rewrite" | "semanticSearch" | "audioNotes" | "qaAssistant"; label: string; info: string }[] = [
  { key: "completions", label: "Inline completions", info: "AI suggests text as you type. Press Tab to accept, Escape to dismiss." },
  { key: "continueWriting", label: "Continue writing", info: "Press Cmd/Ctrl+Shift+Space to generate a full paragraph or suggest document structure." },
  { key: "summarize", label: "Summarize", info: "Generate a short AI summary of your note, shown below the title." },
  { key: "tagSuggestions", label: "Auto-tag suggestions", info: "AI analyzes your note content and suggests relevant tags." },
  { key: "rewrite", label: "Select-and-rewrite", info: "Select text and right-click (or Cmd+Shift+R) to rewrite it with AI." },
  { key: "semanticSearch", label: "Semantic search", info: "Search by meaning, not just keywords. Uses AI embeddings to find related notes." },
  { key: "audioNotes", label: "Audio notes", info: "Record audio and transcribe it into a note using AI." },
  { key: "qaAssistant", label: "AI assistant chat", info: "Ask natural language questions about your notes. Requires semantic search to be enabled." },
];

const STYLE_OPTIONS: { value: CompletionStyle; label: string; info: string }[] = [
  { value: "continue", label: "Continue writing", info: "Predicts and continues your natural writing style." },
  { value: "markdown", label: "Markdown assist", info: "Suggests markdown formatting like headings, lists, and code blocks." },
  { value: "brief", label: "Brief", info: "Short, concise completions — a few words at a time." },
];

const AUDIO_MODE_OPTIONS: { value: AudioMode; label: string; info: string }[] = [
  { value: "meeting", label: "Meeting notes", info: "Structures transcript into attendees, discussion points, decisions, and action items." },
  { value: "lecture", label: "Lecture notes", info: "Organizes into key concepts, definitions, important points, and a summary." },
  { value: "memo", label: "Memo", info: "Cleans up speech into a well-written memo. Fixes grammar and filler words." },
  { value: "verbatim", label: "Verbatim", info: "Minimal processing — adds punctuation and paragraphs but keeps your exact words." },
];

const KEYBOARD_SHORTCUTS: { shortcut: string; macShortcut: string; description: string }[] = [
  { shortcut: "Ctrl + S", macShortcut: "Cmd + S", description: "Save note" },
  { shortcut: "Ctrl + B", macShortcut: "Cmd + B", description: "Bold" },
  { shortcut: "Ctrl + I", macShortcut: "Cmd + I", description: "Italic" },
  { shortcut: "Ctrl + Shift + R", macShortcut: "Cmd + Shift + R", description: "AI Rewrite (with selection)" },
  { shortcut: "Right-click", macShortcut: "Right-click", description: "AI Rewrite (with selection)" },
  { shortcut: "Ctrl + Shift + Space", macShortcut: "Cmd + Shift + Space", description: "Continue writing / suggest structure" },
  { shortcut: "Tab", macShortcut: "Tab", description: "Accept AI completion" },
  { shortcut: "Escape", macShortcut: "Escape", description: "Dismiss AI completion / rewrite menu" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useAiSettings();
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);

  const loadEmbeddingStatus = useCallback(async () => {
    try {
      const status = await getEmbeddingStatus();
      setEmbeddingStatus(status);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (settings.semanticSearch) {
      loadEmbeddingStatus();
      const timer = setInterval(loadEmbeddingStatus, 10_000);
      return () => clearInterval(timer);
    }
  }, [settings.semanticSearch, loadEmbeddingStatus]);

  async function handleSemanticSearchToggle(enabled: boolean) {
    updateSetting("semanticSearch", enabled);
    if (!enabled) {
      updateSetting("qaAssistant", false);
    }
    try {
      if (enabled) {
        await enableEmbeddings();
        loadEmbeddingStatus();
      } else {
        await disableEmbeddings();
        setEmbeddingStatus(null);
      }
    } catch {
      // Revert on failure
      updateSetting("semanticSearch", !enabled);
    }
  }

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );

  return (
    <div className="flex h-full items-start justify-center bg-background overflow-auto">
      <div className="w-full max-w-3xl p-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>

        <h1 className="text-xl font-semibold text-foreground mb-6">Settings</h1>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="bg-card border border-border rounded-lg p-4 flex-1 min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              AI Features
            </h2>

            <div className="divide-y divide-border">
              {TOGGLE_SETTINGS.map(({ key, label, info }) => (
                <div key={key}>
                  <ToggleSwitch
                    label={label}
                    checked={settings[key]}
                    onChange={(value) =>
                      key === "semanticSearch"
                        ? handleSemanticSearchToggle(value)
                        : updateSetting(key, value)
                    }
                    info={info}
                    disabled={key === "qaAssistant" && !settings.semanticSearch}
                  />
                  {key === "semanticSearch" && settings.semanticSearch && embeddingStatus && (
                    <div className="pb-3 pl-1 text-xs text-muted-foreground">
                      {embeddingStatus.pendingCount > 0
                        ? `${embeddingStatus.totalWithEmbeddings} embedded, ${embeddingStatus.pendingCount} pending`
                        : `${embeddingStatus.totalWithEmbeddings} notes embedded`}
                    </div>
                  )}
                  {key === "completions" && settings.completions && (
                    <div className="pb-3 pl-1" role="radiogroup" aria-label="Completion style">
                      {STYLE_OPTIONS.map(({ value, label: styleLabel, info: styleInfo }) => (
                        <label key={value} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="radio"
                            name="completionStyle"
                            value={value}
                            checked={settings.completionStyle === value}
                            onChange={() => updateSetting("completionStyle", value)}
                            className="accent-primary"
                            aria-label={styleLabel}
                          />
                          <span className="text-sm text-muted-foreground">{styleLabel}</span>
                          <InfoIcon tooltip={styleInfo} />
                        </label>
                      ))}
                    </div>
                  )}
                  {key === "audioNotes" && settings.audioNotes && (
                    <div className="pb-3 pl-1" role="radiogroup" aria-label="Audio mode">
                      {AUDIO_MODE_OPTIONS.map(({ value, label: modeLabel, info: modeInfo }) => (
                        <label key={value} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="radio"
                            name="audioMode"
                            value={value}
                            checked={settings.audioMode === value}
                            onChange={() => updateSetting("audioMode", value)}
                            className="accent-primary"
                            aria-label={modeLabel}
                          />
                          <span className="text-sm text-muted-foreground">{modeLabel}</span>
                          <InfoIcon tooltip={modeInfo} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 flex-1 min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Keyboard Shortcuts
            </h2>
            <div className="space-y-2">
              {KEYBOARD_SHORTCUTS.map(({ shortcut, macShortcut, description }) => (
                <div key={`${shortcut}-${description}`} className="flex items-center justify-between py-1">
                  <span className="text-sm text-foreground">{description}</span>
                  <kbd className="px-2 py-0.5 rounded bg-background border border-border text-xs text-muted-foreground font-mono whitespace-nowrap ml-3">
                    {isMac ? macShortcut : shortcut}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
